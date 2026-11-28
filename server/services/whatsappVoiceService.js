const { randomUUID } = require("node:crypto");
const env = require("../config/env");
const Call = require("../models/WhatsAppVoiceCall");
const Settings = require("../models/WhatsAppVoiceSettings");
const provider = require("./whatsappVoiceProvider");
const { logger } = require("../utils/logger");
const { voiceProvider, supportsModel, resolveVoiceModel } = require("./whatsappVoiceModels");

const LIVE = ["incoming", "active"];
const LANGUAGES = ["hi", "en", "hinglish"];
const START_TIMEOUT = 25_000;
const RETENTION = 30 * 86400_000;
const SETTINGS_ID = "default";
const DEFAULT_GREETING = "Namaste! Main Pulse AI, Prakash Electronics ka AI assistant hoon. Batayein, aaj main aapki kya help kar sakta hoon?";

function configurationReady() {
  const voice = env.pulseVoice;
  const spec = voiceProvider(voice.provider);
  return Boolean(env.whatsapp.enabled && env.metaApp.appSecret && env.mongoUri
    && voice.phoneNumberId && voice.businessAccountId && voice.accessToken
    && spec && voice[spec.key] && supportsModel(voice.provider, voice[spec.model])
    && voice.livekitUrl && voice.livekitKey && voice.livekitSecret);
}

async function getSettings() {
  const saved = await Settings.findById(SETTINGS_ID).lean() || {};
  return {
    enabled: saved?.enabled ?? false,
    ...resolveVoiceModel(env.pulseVoice, saved),
    greeting: saved?.greeting || DEFAULT_GREETING,
    languages: saved?.languages?.length ? saved.languages : LANGUAGES,
    maxConcurrent: Math.min(saved?.maxConcurrent || env.pulseVoice.maxConcurrent, env.pulseVoice.maxConcurrent),
  };
}

function parseCallEvents(payload) {
  if (payload?.object !== "whatsapp_business_account" || !Array.isArray(payload.entry)) return [];
  const events = [];
  for (const entry of payload.entry) {
    if (!Array.isArray(entry?.changes)) continue;
    for (const change of entry.changes) {
      const value = change?.value;
      const phoneNumberId = value?.metadata?.phone_number_id;
      if (change?.field !== "calls" || !/^\d{4,32}$/.test(phoneNumberId)
        || !Array.isArray(value.calls)) continue;
      for (const call of value.calls) {
        if (typeof call?.id !== "string" || !/^[\w.+/=:-]{1,256}$/.test(call.id)
          || (call.direction && call.direction !== "USER_INITIATED")) continue;
        const phone = typeof call.from === "string" && /^\+?\d{7,15}$/.test(call.from)
          ? call.from.replace(/^\+/, "") : undefined;
        const scopedId = typeof call.from_user_id === "string" && /^[\w.-]{1,128}$/.test(call.from_user_id)
          ? call.from_user_id : undefined;
        const common = {
          id: call.id, phoneNumberId: String(phoneNumberId), businessAccountId: String(entry.id),
          caller: phone || scopedId, phone, timestamp: Number(call.timestamp), type: call.event,
        };
        if (call.event === "connect" && call.session?.sdp_type === "offer"
          && typeof call.session.sdp === "string" && call.session.sdp.length <= 64_000
          && call.session.sdp.startsWith("v=0")) events.push({ ...common, sdp: call.session.sdp });
        if (call.event === "terminate") {
          const code = (Array.isArray(call.errors) ? call.errors : Array.isArray(value.errors) ? value.errors : [])[0]?.code;
          events.push({
            ...common, inbound: call.direction === "USER_INITIATED",
            failed: String(call.status).toUpperCase() === "FAILED",
            duration: Number.isInteger(call.duration) && call.duration >= 0 ? call.duration : undefined,
            errorCode: Number.isSafeInteger(code) ? `meta_${code}` : undefined,
          });
        }
      }
    }
  }
  return events;
}

function createVoiceService({ calls = Call, loadSettings = getSettings, transport = provider, config = env.pulseVoice } = {}) {
  let windowStart = 0;
  let offers = 0;

  function withinRate() {
    const now = Date.now();
    if (now - windowStart >= 60_000) {
      windowStart = now;
      offers = 0;
    }
    return ++offers <= 120;
  }

  async function createCall(data) {
    try {
      return await calls.create(data);
    } catch (error) {
      if (error.code !== 11000) throw error;
      return null;
    }
  }

  async function clean(call, fromMeta) {
    if (!call?.roomName) return true;
    try {
      await transport.disconnect(call, fromMeta);
      return true;
    } catch (error) {
      if (error.status === 404 || error.code === "not_found") return true;
      logger.warn("whatsapp.voice.cleanup_failed", { source: fromMeta ? "meta" : "server" });
      return false;
    }
  }

  async function cleanupPending(callId) {
    const now = Date.now();
    const lease = new Date(now + 15_000);
    const call = await calls.findOneAndUpdate({ _id: callId, cleanupAfter: { $lte: new Date(now) } },
      { $set: { cleanupAfter: lease }, $inc: { cleanupAttempts: 1 } }, { new: true }).lean();
    if (!call) return;
    const cleaned = await clean(call, call.cleanupFromMeta);
    if (cleaned || call.cleanupAttempts >= 3) {
      await calls.updateOne({ _id: callId, cleanupAfter: lease }, {
        $unset: { slot: 1, cleanupAfter: 1, cleanupFromMeta: 1 },
        ...(!cleaned && { $set: { errorCode: call.errorCode || "connector_cleanup" } }),
      });
    }
  }

  async function markFinished(callId, state, errorCode, { fromMeta = false, duration, deadline } = {}) {
    const match = { _id: callId, ...(deadline && { deadline }) };
    const call = await calls.findOne({ ...match, state: { $in: LIVE } }).lean();
    if (!call) return;
    const endedAt = new Date();
    const finalState = state === "completed" && !call.startedAt && duration === undefined ? "missed" : state;
    const durationSeconds = duration ?? (call.startedAt ? Math.max(0, Math.round((endedAt - call.startedAt) / 1000)) : 0);
    const needsCleanup = Boolean(call.roomName);
    const result = await calls.updateOne(
      { ...match, state: call.state },
      { $set: { state: finalState, endedAt, durationSeconds, ...(errorCode && { errorCode }),
        ...(fromMeta && { metaFinal: true }),
        ...(needsCleanup && { cleanupAfter: endedAt, cleanupFromMeta: fromMeta }) },
        $unset: { deadline: 1, workerClaim: 1, ...(!needsCleanup && { slot: 1 }) } },
    );
    if (!result.modifiedCount) return markFinished(callId, state, errorCode, { fromMeta, duration, deadline });
    if (needsCleanup) return () => cleanupPending(callId);
  }

  async function finish(callId, state, errorCode, options) {
    const work = await markFinished(callId, state, errorCode, options);
    if (work) await work();
  }

  async function receive(event) {
    if (event.phoneNumberId !== config.phoneNumberId || event.businessAccountId !== config.businessAccountId) return;
    const before = await calls.findById(event.id).lean();
    if (event.type === "terminate") {
      if (before) {
        const work = await markFinished(event.id, event.failed ? "failed" : "completed", event.errorCode, {
          fromMeta: true, duration: event.duration,
        });
        if (!work && before.roomName) {
          // A worker can close first. Keep its failure reason, but prefer Meta's measured duration.
          await calls.updateOne({ _id: event.id, state: { $in: ["completed", "failed", "missed"] }, metaFinal: { $ne: true } },
            { $set: { metaFinal: true, ...(event.duration !== undefined && { durationSeconds: event.duration }),
              ...(event.failed && { state: "failed" }), ...(event.errorCode && { errorCode: event.errorCode }) } });
        }
        return work;
      }
      if (event.inbound) {
        const tombstone = await createCall({
          _id: event.id, phoneNumberId: event.phoneNumberId, caller: event.caller, phone: event.phone,
          state: event.failed ? "failed" : event.duration === undefined ? "missed" : "completed",
          endedAt: new Date(), durationSeconds: event.duration ?? 0, errorCode: event.errorCode, metaFinal: true,
          expiresAt: new Date(Date.now() + RETENTION),
        });
        if (!tombstone) return markFinished(event.id, event.failed ? "failed" : "completed", event.errorCode, {
          fromMeta: true, duration: event.duration,
        });
      }
      return;
    }
    if (before) return;
    const now = Date.now();
    if (Number.isFinite(event.timestamp) && Math.abs(now - event.timestamp * 1000) > 60_000) return;
    const settings = await loadSettings();
    const base = {
      _id: event.id, phoneNumberId: event.phoneNumberId, caller: event.caller, phone: event.phone,
      provider: settings.provider, model: settings.model, voice: settings.voice, expiresAt: new Date(now + RETENTION),
    };
    let reason = settings.enabled ? "concurrency_limit" : "disabled";
    if (settings.enabled && !withinRate()) reason = "rate_limit";
    if (reason === "concurrency_limit") {
      const roomName = `pulse-wa-${randomUUID()}`;
      let slots = settings.maxConcurrent;
      const occupied = await calls.find({ slot: { $exists: true } }).select("slot").sort({ slot: -1 }).lean();
      // Keep a slot for each call above the new limit until that call drains.
      for (const entry of occupied) if (entry.slot >= slots) slots -= 1;
      for (let slot = 0; slot < slots; slot += 1) {
        const claimed = await createCall({ ...base, state: "incoming", roomName, slot,
          deadline: new Date(now + START_TIMEOUT), greeting: settings.greeting, languages: settings.languages });
        if (claimed) return async () => {
          try {
            if (!await calls.exists({ _id: event.id, state: "incoming" })) return;
            await transport.accept(claimed, event.sdp);
            if (!await calls.exists({ _id: event.id, state: { $in: LIVE } })) await clean(claimed, false);
          } catch {
            await finish(event.id, "failed", "connector_accept");
          }
        };
        if (await calls.exists({ _id: event.id })) return;
      }
    }
    const missed = await createCall({ ...base, state: "missed", endedAt: new Date(), errorCode: reason });
    if (missed) return async () => {
      try {
        await transport.reject(missed);
      } catch {
        await calls.updateOne({ _id: event.id }, { $set: { errorCode: "reject_failed" } });
      }
    };
  }

  async function expire() {
    const expired = await calls.find({ state: { $in: LIVE }, deadline: { $lte: new Date() } }).limit(25).lean();
    await Promise.all(expired.map((call) =>
      finish(call._id, call.state === "active" ? "completed" : "failed",
        call.state === "active" ? "duration_limit" : "connection_timeout", { deadline: call.deadline })));
    const pending = await calls.find({ cleanupAfter: { $lte: new Date() } }).limit(25).lean();
    await Promise.all(pending.map((call) => cleanupPending(call._id)));
  }

  return { receive, finish, expire };
}

const voice = createVoiceService();
let indexes;
function ensureIndexes() {
  indexes ||= Call.createIndexes().catch((error) => { indexes = null; throw error; });
  return indexes;
}

function startVoiceCleanup() {
  if (!env.pulseVoice.enabled || !configurationReady()) return;
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      await ensureIndexes();
      await voice.expire();
    } catch {
      logger.warn("whatsapp.voice.reconciliation_failed");
    } finally {
      running = false;
    }
  };
  void run();
  setInterval(run, 5000).unref();
}

module.exports = { ...voice, createVoiceService, parseCallEvents, ensureIndexes, startVoiceCleanup,
  configurationReady, getSettings, SETTINGS_ID, LANGUAGES, LIVE };
