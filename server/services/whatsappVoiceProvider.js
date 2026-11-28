const env = require("../config/env");
const { graphRequest } = require("./whatsappCloudApiService");

function connector() {
  const { ConnectorClient, RoomServiceClient } = require("livekit-server-sdk");
  const { livekitUrl, livekitKey, livekitSecret } = env.pulseVoice;
  return {
    call: new ConnectorClient(livekitUrl, livekitKey, livekitSecret, { requestTimeout: 5 }),
    room: new RoomServiceClient(livekitUrl, livekitKey, livekitSecret, { requestTimeout: 5 }),
  };
}

async function accept(call, sdp) {
  const { RoomAgentDispatch } = require("@livekit/protocol");
  const result = await connector().call.acceptWhatsAppCall({
    whatsappPhoneNumberId: call.phoneNumberId,
    whatsappApiKey: env.pulseVoice.accessToken,
    whatsappCloudApiVersion: env.whatsapp.graphApiVersion.replace(/^v/, ""),
    whatsappCallId: call._id,
    roomName: call.roomName,
    participantIdentity: "whatsapp-caller",
    destinationCountry: "IN",
    agents: [new RoomAgentDispatch({ agentName: env.pulseVoice.agentName })],
    sdp: { type: "offer", sdp },
    timeout: 8,
  });
  if (result.roomName !== call.roomName) throw new Error("Unexpected LiveKit room");
}

function reject(call) {
  return graphRequest({
    phoneNumberId: call.phoneNumberId, accessToken: env.pulseVoice.accessToken, path: "calls", timeoutMs: 4000,
    body: { messaging_product: "whatsapp", call_id: call._id, action: "reject" },
  });
}

async function dial(call) {
  const result = await connector().call.dialWhatsAppCall({
    whatsappPhoneNumberId: call.phoneNumberId,
    whatsappToPhoneNumber: call.phone,
    whatsappApiKey: env.pulseVoice.accessToken,
    whatsappCloudApiVersion: env.whatsapp.graphApiVersion.replace(/^v/, ""),
    whatsappBizOpaqueCallbackData: call._id,
    roomName: call.roomName,
    participantIdentity: "whatsapp-caller",
    destinationCountry: "IN",
    ringingTimeout: 25,
  });
  if (result.roomName !== call.roomName || !result.whatsappCallId) throw new Error("Invalid LiveKit dial response");
  return result.whatsappCallId;
}

async function connectOutbound(call, sdp) {
  await connector().call.connectWhatsAppCall(call.metaCallId, { type: "answer", sdp });
}

async function dispatchOutbound(roomName) {
  const { AgentDispatchClient } = require("livekit-server-sdk");
  const { livekitUrl, livekitKey, livekitSecret, agentName } = env.pulseVoice;
  const dispatch = new AgentDispatchClient(livekitUrl, livekitKey, livekitSecret, { requestTimeout: 5 });
  await dispatch.createDispatch(roomName, agentName);
}

async function disconnect(call, fromMeta) {
  const { DisconnectWhatsAppCallRequest_DisconnectReason: reason } = require("@livekit/protocol");
  const client = connector();
  try {
    const metaCallId = call.direction === "outbound" ? call.metaCallId : call._id;
    if (metaCallId) await client.call.disconnectWhatsAppCall(
      metaCallId, fromMeta ? "" : env.pulseVoice.accessToken,
      fromMeta ? reason.USER_INITIATED : reason.BUSINESS_INITIATED,
    );
  } catch (error) {
    if (error.status !== 404 && error.code !== "not_found") throw error;
  } finally {
    await client.room.deleteRoom(call.roomName).catch((error) => {
      if (error.status !== 404 && error.code !== "not_found") throw error;
    });
  }
}

module.exports = { accept, reject, disconnect, dial, connectOutbound, dispatchOutbound };
