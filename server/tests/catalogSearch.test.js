const assert = require("node:assert/strict");
const test = require("node:test");
const env = require("../config/env");
const { searchCatalog } = require("../services/catalogSearch");

const empty = { items: [], total: 0 };
const search = (value) => ({ search: value, smartSearch: "true" });

function matches(product, filter) {
  return filter.$and.every((clause) => {
    if (clause.price) {
      return product.price >= (clause.price.$gte ?? 0) && product.price <= (clause.price.$lte ?? Infinity);
    }
    return clause.$or.some((fieldMatch) => {
      const [field, pattern] = Object.entries(fieldMatch)[0];
      const values = [].concat(product[field] || []);
      return values.some((value) => new RegExp(pattern.$regex, pattern.$options).test(value));
    });
  });
}

function fixtureCatalog(products) {
  return (filter) => {
    if (!filter) return empty;
    const items = products.filter((product) => matches(product, filter));
    return { items, total: items.length };
  };
}

test("honors existing literal results, including requests past the last page", async () => {
  const literal = { items: [], total: 3 };
  const result = await searchCatalog(search("speaker"), (filter) => {
    assert.equal(filter, undefined);
    return literal;
  });
  assert.equal(result, literal);
});

test("leaves hashtag and legacy requests on their existing path", async () => {
  for (const query of [search("#speker"), { search: "#speker" }, { search: "" }]) {
    const result = await searchCatalog(query, (filter) => {
      assert.equal(filter, undefined);
      return empty;
    });
    assert.equal(result, empty);
  }
});

test("reports an eligible literal miss without asking Gemini", async () => {
  const result = await searchCatalog({ search: "Diya neo" }, (filter) => {
    assert.equal(filter, undefined);
    return empty;
  });
  assert.deepEqual(result, { ...empty, canAnalyze: true });
});

test("the analysis request skips the literal query and finds Deep Neon from a partial Diya search", async (t) => {
  const originalKey = env.geminiApiKey;
  env.geminiApiKey = "";
  t.after(() => { env.geminiApiKey = originalKey; });
  const deepNeon = { name: "Multicolour Deep Neon Light" };
  const catalog = fixtureCatalog([deepNeon, { name: "Diya LED" }]);
  const result = await searchCatalog({ search: "Diya neo", smartSearch: "analyze" }, (filter) => {
    assert.ok(filter, "the literal search already ran in the first request");
    return catalog(filter);
  });
  assert.deepEqual(result, { items: [deepNeon], total: 1, searchMode: "similar" });
});

test("matches catalog typos without weakening model and voltage terms", async (t) => {
  const originalKey = env.geminiApiKey;
  env.geminiApiKey = "";
  t.after(() => { env.geminiApiKey = originalKey; });
  const matchingProduct = { name: "Bluetooth Speaker 12V" };
  const result = await searchCatalog(search("blutooth speker 12v"), fixtureCatalog([
    matchingProduct,
    { name: "Bluetooth Speaker 24V" },
    { name: "Bluetooth Amplifier 12V" },
  ]));
  assert.deepEqual(result, { items: [matchingProduct], total: 1, searchMode: "similar" });
});

test("understands Bluetooth song player as a speaker when Gemini is unavailable", async (t) => {
  const originalKey = env.geminiApiKey;
  env.geminiApiKey = "";
  t.after(() => { env.geminiApiKey = originalKey; });

  const speaker = { name: "Portable Bluetooth Speaker" };
  const catalog = fixtureCatalog([
    speaker,
    { name: "Wired Speaker" },
    { name: "Bluetooth Adapter", description: "Connects to a speaker" },
  ]);
  const result = await searchCatalog({ search: "bluetooth song player", smartSearch: "analyze" }, catalog);
  assert.deepEqual(result, { items: [speaker], total: 1, searchMode: "similar" });
});

test("retains a brand and model when converting wireless music player wording", async () => {
  const speaker = { name: "JBL Go 4 Wireless Speaker" };
  const result = await searchCatalog(search("JBL Go 4 wireless music player"), fixtureCatalog([
    speaker,
    { name: "JBL Go 3 Wireless Speaker" },
    { name: "Sony Go 4 Wireless Speaker" },
  ]));
  assert.deepEqual(result, { items: [speaker], total: 1, searchMode: "similar" });
});

test("uses Gemini keywords for a Hinglish intent and keeps the price limit in the catalog query", async (t) => {
  t.mock.method(global, "fetch", async (_url, options) => {
    assert.equal(JSON.parse(options.body).contents[0].parts[0].text, "gaane bajane ke liye wireless 1000 tak");
    return Response.json({
      candidates: [{ content: { parts: [{ text: '{"terms":["bluetooth","speaker"]}' }] } }],
    });
  });
  const originalKey = env.geminiApiKey;
  env.geminiApiKey = "test-key";
  t.after(() => { env.geminiApiKey = originalKey; });

  const matchingProduct = { name: "Bluetooth Speaker", price: 800 };
  const result = await searchCatalog({ search: "gaane bajane ke liye wireless 1000 tak", smartSearch: "analyze" }, fixtureCatalog([
    matchingProduct,
    { name: "Bluetooth Speaker", price: 1200 },
    { name: "Wired Speaker", price: 700 },
  ]));
  assert.deepEqual(result, { items: [matchingProduct], total: 1, searchMode: "ai" });
  assert.equal(global.fetch.mock.callCount(), 1);
});

test("returns the existing empty result when the AI response is unavailable", async (t) => {
  t.mock.method(global, "fetch", async () => { throw new TypeError("fetch failed"); });
  const originalKey = env.geminiApiKey;
  env.geminiApiKey = "test-key";
  t.after(() => { env.geminiApiKey = originalKey; });
  assert.equal(await searchCatalog(search("music ke liye kuch"), fixtureCatalog([])), empty);
});

test("tries alternative AI product names without dropping explicit Bluetooth or voltage", async (t) => {
  t.mock.method(global, "fetch", async () => Response.json({
    candidates: [{ content: { parts: [{
      text: '{"terms":["speaker","for","party"],"alternatives":[["boombox"]]}',
    }] } }],
  }));
  const originalKey = env.geminiApiKey;
  env.geminiApiKey = "test-key";
  t.after(() => { env.geminiApiKey = originalKey; });

  const boombox = { name: "Portable Bluetooth Boombox 12V" };
  const result = await searchCatalog(
    { search: "Bluetooth 12V loud music for a party", smartSearch: "analyze" },
    fixtureCatalog([boombox, { name: "Wired Boombox 12V" }, { name: "Bluetooth Boombox 24V" }]),
  );
  assert.deepEqual(result, { items: [boombox], total: 1, searchMode: "ai" });
  assert.equal(global.fetch.mock.callCount(), 1);
});
