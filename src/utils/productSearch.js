/** Normalize tag values for compare/search (`#Speaker` → `speaker`). */
export function normalizeTag(value = "") {
  return String(value || "")
    .trim()
    .replace(/^#+/, "")
    .toLowerCase();
}

/** Display form used in the search box / chips. */
export function formatTagQuery(value = "") {
  const tag = normalizeTag(value);
  return tag ? `#${tag}` : "";
}

export function isTagSearchQuery(query = "") {
  return String(query || "").trim().startsWith("#");
}

export function getProductTags(product = {}) {
  return Array.isArray(product.tags) ? product.tags.map((tag) => String(tag || "").trim()).filter(Boolean) : [];
}

/**
 * Tag queries (`#speaker`) match product tags only.
 * Normal queries still search name/category/description/tags text.
 */
export function productMatchesSearch(product = {}, rawQuery = "", extraFields = []) {
  const query = String(rawQuery || "").trim();
  if (!query) return true;

  const tags = getProductTags(product);

  if (isTagSearchQuery(query)) {
    const wanted = normalizeTag(query);
    if (!wanted) return true;
    return tags.some((tag) => normalizeTag(tag) === wanted);
  }

  const term = query.toLowerCase();
  const haystack = [
    product.name,
    product.title,
    product.category,
    product.originalCategory,
    product.subCategory,
    product.availability,
    product.shortDescription,
    product.description,
    tags.join(" "),
    ...extraFields,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return haystack.includes(term);
}

/** Read `?tag=` / `?q=` / `?search=` into a search-box value. */
export function readSearchQueryFromLocation(search = typeof window !== "undefined" ? window.location.search : "") {
  const params = new URLSearchParams(search);
  const tag = params.get("tag");
  if (tag) return formatTagQuery(tag);
  return String(params.get("q") || params.get("search") || "").trim();
}

/**
 * Build a catalog URL that opens with a hashtag filter applied.
 * @param {string} tag
 * @param {{ catalog?: "products" | "wiring-parts" }} [options]
 */
export function getTagSearchHref(tag, { catalog = "products" } = {}) {
  const normalized = normalizeTag(tag);
  if (!normalized) return catalog === "wiring-parts" ? "/wiring-parts" : "/products";
  const base = catalog === "wiring-parts" ? "/wiring-parts" : "/products";
  return `${base}?tag=${encodeURIComponent(normalized)}`;
}

function productKey(product = {}) {
  return String(product._id || product.sourceId || product.slug || product.id || "").trim();
}

function productCategories(product = {}) {
  return [
    product.category,
    product.originalCategory,
    product.subCategory,
  ]
    .map((value) => String(value || "").trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Rank catalog items by shared category / tags with the current product.
 */
export function getRelatedProducts(currentProduct, catalog = [], { limit = 8 } = {}) {
  if (!currentProduct || !Array.isArray(catalog) || !catalog.length) return [];

  const currentKey = productKey(currentProduct);
  const currentCategories = new Set(productCategories(currentProduct));
  const currentTags = new Set(getProductTags(currentProduct).map(normalizeTag).filter(Boolean));

  return catalog
    .filter((item) => {
      const key = productKey(item);
      if (!key || (currentKey && key === currentKey)) return false;
      if (currentProduct.slug && item.slug && String(item.slug) === String(currentProduct.slug)) return false;
      return Boolean(item.imageUrl || item.name);
    })
    .map((item) => {
      const itemCategories = productCategories(item);
      const itemTags = getProductTags(item).map(normalizeTag).filter(Boolean);
      const sharedCategory = itemCategories.some((category) => currentCategories.has(category));
      const sharedTagCount = itemTags.reduce((count, tag) => count + (currentTags.has(tag) ? 1 : 0), 0);
      const score = (sharedCategory ? 3 : 0) + sharedTagCount * 2;
      return { item, score, sharedCategory, sharedTagCount };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return String(a.item.name || "").localeCompare(String(b.item.name || ""));
    })
    .slice(0, limit)
    .map((entry) => entry.item);
}
