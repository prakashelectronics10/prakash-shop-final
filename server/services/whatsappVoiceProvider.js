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

async function disconnect(call, fromMeta) {
  const { DisconnectWhatsAppCallRequest_DisconnectReason: reason } = require("@livekit/protocol");
  const client = connector();
  try {
    await client.call.disconnectWhatsAppCall(
      call._id, fromMeta ? "" : env.pulseVoice.accessToken,
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

module.exports = { accept, reject, disconnect };
