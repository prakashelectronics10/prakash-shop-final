import { cli, defineAgent, inference, llm, ServerOptions, voice } from "@livekit/agents";
import mongoose from "mongoose";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import env from "../config/env.js";
import Call from "../models/WhatsAppVoiceCall.js";
import Account from "../models/WhatsAppAccount.js";
import knowledgeService from "../services/pulseAIKnowledgeService.js";
import lifecycle from "../services/whatsappVoiceService.js";
import voiceTools from "../services/whatsappVoiceTools.js";
import voiceModels from "../services/whatsappVoiceModels.js";
import audio from "../services/whatsappVoiceAudio.js";
import log from "../utils/logger.js";

const { logger } = log;
const identity = "whatsapp-caller";
const config = env.pulseVoice;

export default defineAgent({
  entry: async (ctx) => {
    let call;
    let session;
    let model;
    let ended = false;
    let timer;
    let shutdown;
    let closing = false;
    let usageTracker;
    const consent = voiceTools.createConfirmation();
    // Shutdown and provider events can fire together. Only one owner should close the session.
    const finalize = (state, reason) => {
      if (shutdown) return shutdown;
      ended = true;
      clearTimeout(timer);
      consent.clear();
      shutdown = Promise.resolve().then(async () => {
        if (call) await lifecycle.finish(call._id, state, reason).catch(() => logger.warn("whatsapp.voice.finish_failed"));
        await session?.close().catch(() => logger.warn("whatsapp.voice.session_close_failed"));
        await model?.close().catch(() => logger.warn("whatsapp.voice.model_close_failed"));
        const usage = usageTracker?.totals();
        if (call && usage && Object.keys(usage).length) {
          await Call.updateOne({ _id: call._id }, { $set: { usage } }).catch(() => logger.warn("whatsapp.voice.usage_write_failed"));
        }
      });
      return shutdown;
    };
    const finish = (state, reason) => shutdown || finalize(state, reason).finally(() => ctx.shutdown(reason || state));
    ctx.addShutdownCallback(async () => {
      await finalize("completed");
      await mongoose.disconnect();
    });

    try {
      if (!config.enabled || !lifecycle.configurationReady()) throw new Error("Voice configuration incomplete");
      await mongoose.connect(env.mongoUri, { autoIndex: false, bufferCommands: false,
        serverSelectionTimeoutMS: 5000, maxPoolSize: 4, socketTimeoutMS: 12_000 });
      const roomName = ctx.job.room?.name;
      if (!roomName?.startsWith("pulse-wa-")) return ctx.shutdown("unrecognized room");
      const workerClaim = randomUUID();
      call = await Call.findOneAndUpdate({
        roomName, state: "incoming", deadline: { $gt: new Date() }, workerClaim: { $exists: false },
      }, { $set: { workerClaim } }, { new: true }).lean();
      if (!call) return ctx.shutdown("call unavailable");
      timer = setTimeout(() => void finish("failed", "connection_timeout"), Math.max(0, +call.deadline - Date.now()));
      const [storedAccount, knowledge] = await Promise.all([
        Account.findOne({ phoneNumberId: call.phoneNumberId, businessAccountId: config.businessAccountId, isActive: true })
          .select("_id phoneNumberId businessAccountId").lean(),
        knowledgeService.getPulseAIKnowledge(),
        ctx.connect().then(() => ctx.waitForParticipant(identity)),
      ]);
      if (ended) return;
      const account = storedAccount && { ...storedAccount, accessToken: config.accessToken };
      const endCall = () => {
        if (closing || ended) return false;
        closing = true;
        setImmediate(async () => {
          if (ended) return;
          try {
            const goodbye = session.generateReply({
              instructions: "Say a brief friendly goodbye in the caller's language. Do not ask another question or use any tools.",
              ...(call.provider === "openai" && { toolChoice: "none" }),
              allowInterruptions: true,
            });
            await goodbye.waitForPlayout();
            if (goodbye.interrupted) { closing = false; return; }
            await finish("completed");
          } catch {
            closing = false;
            logger.warn("whatsapp.voice.farewell_failed");
          }
        });
        return true;
      };
      const tools = Object.entries(voiceTools.createVoiceTools({
        call, account, consent, stopped: () => ended, endCall,
      })).map(([name, tool]) => llm.tool({ name, ...tool }));
      call.provider = voiceModels.callProvider(call);
      const runtime = await audio.createVoiceRuntime(call, config, consent, inference);
      model = runtime.llm;
      if (ended) {
        await model.close();
        return;
      }
      session = new voice.AgentSession({ llm: model, vad: runtime.vad });
      if (runtime.onSpeechBoundary) session.on("user_state_changed", runtime.onSpeechBoundary);
      usageTracker = audio.createUsageTracker(call.provider);
      audio.bindVoiceSession(session, finish, usageTracker.record);
      const agent = new voice.Agent({ instructions: audio.voiceInstructions(call, knowledge), tools });
      await session.start({
        agent,
        room: ctx.room,
        record: false,
        inputOptions: { participantIdentity: identity, textEnabled: false, videoEnabled: false, closeOnDisconnect: true },
        outputOptions: { transcriptionEnabled: false },
      });
      if (ended) return;
      const startedAt = new Date();
      const result = await Call.updateOne({ _id: call._id, state: "incoming", workerClaim, deadline: { $gt: startedAt } },
        { $set: { state: "active", startedAt, deadline: new Date(+startedAt + config.maxDuration * 1000) } });
      if (!result.modifiedCount) return finish("failed", "connection_timeout");
      if (ended) return;
      clearTimeout(timer);
      timer = setTimeout(() => void finish("completed", "duration_limit"), config.maxDuration * 1000);
      const greeting = session.generateReply({
        instructions: call.direction === "outbound"
          ? "Briefly identify yourself as Pulse AI from Prakash Electronics and say you are calling because they allowed a WhatsApp call. Ask how you can help with their recent message. Do not call tools to greet."
          : `Say this greeting once as written, then listen. Do not call tools to greet: ${call.greeting}`,
        ...(call.provider === "openai" && { toolChoice: "none" }),
        allowInterruptions: true,
      });
      void greeting.waitForPlayout().catch(() => {
        if (!greeting.interrupted && !ended) void finish("failed", "greeting_failed");
      });
    } catch {
      logger.warn("whatsapp.voice.worker_start_failed");
      await finish("failed", "worker_start");
    }
  },
});

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!config.enabled || !lifecycle.configurationReady()) {
    logger.error("whatsapp.voice.worker_configuration_missing");
    process.exitCode = 1;
  } else {
    cli.runApp(new ServerOptions({
      agent: fileURLToPath(import.meta.url),
      agentName: config.agentName,
      wsURL: config.livekitUrl,
      apiKey: config.livekitKey,
      apiSecret: config.livekitSecret,
    }));
  }
}
