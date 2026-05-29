const Admin = require("../models/Admin");

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const DEFAULT_CHANNEL_ID = "bookings";

function isExpoPushToken(token) {
  return /^(ExponentPushToken|ExpoPushToken)\[[^\]]+\]$/.test(String(token || "").trim());
}

function compactMessage(message) {
  return String(message || "").replace(/\s+/g, " ").trim().slice(0, 180);
}

function notificationBody(notification) {
  return compactMessage(notification.body || notification.message);
}

function tokenValue(item) {
  if (!item) return "";
  return typeof item === "string" ? item : String(item.token || "").trim();
}

function notificationData(notification) {
  return {
    screen: "notifications",
    notificationId: String(notification._id || ""),
    type: notification.type,
    ...(notification.data || {}),
  };
}

function pushPayloadForToken(token, notification) {
  const data = notificationData(notification);
  return {
    to: token,
    sound: "default",
    title: String(notification.title || "Prakash Electronics").slice(0, 80),
    body: notificationBody(notification),
    data,
    priority: "high",
    channelId: notification.channelId || data.channelId || DEFAULT_CHANNEL_ID,
    categoryId: notification.categoryId,
  };
}

async function removeInvalidExpoTokens(tokens) {
  const invalidTokens = [...new Set((tokens || []).map(tokenValue).filter(Boolean))];
  if (!invalidTokens.length) return;
  await Admin.updateMany(
    {},
    {
      $pull: {
        pushTokens: { token: { $in: invalidTokens } },
        expoPushTokens: { token: { $in: invalidTokens } },
      },
    },
  );
  console.warn("[push] Removed invalid Expo push tokens:", invalidTokens);
}

async function sendExpoPushMessages(messages) {
  const chunks = [];
  for (let index = 0; index < messages.length; index += 100) {
    chunks.push(messages.slice(index, index + 100));
  }

  const invalidTokens = [];
  const tickets = [];

  await Promise.all(chunks.map(async (chunk) => {
    if (!chunk.length || typeof fetch !== "function") return;
    console.log("[push] Sending Expo push request:", {
      count: chunk.length,
      tokens: chunk.map((message) => message.to),
      channelId: chunk[0]?.channelId,
    });
    const response = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Accept-Encoding": "gzip, deflate",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(chunk),
    });
    if (!response.ok) {
      throw new Error(`Expo push failed with status ${response.status}`);
    }
    const payload = await response.json().catch(() => ({}));
    const responseTickets = Array.isArray(payload.data) ? payload.data : [];
    tickets.push(...responseTickets);
    console.log("[push] Expo push response tickets:", responseTickets);
    responseTickets.forEach((ticket, index) => {
      if (ticket?.status === "error" && ticket?.details?.error === "DeviceNotRegistered") {
        invalidTokens.push(chunk[index]?.to);
      }
    });
  }));

  if (invalidTokens.length) await removeInvalidExpoTokens(invalidTokens);
  return tickets;
}

async function sendPushToAdmins(adminIds, notification) {
  const ids = [...new Set((adminIds || []).map((id) => String(id || "")).filter(Boolean))];
  if (!ids.length) return { sent: 0, tickets: [] };

  const admins = await Admin.find({ _id: { $in: ids }, isActive: true })
    .select("_id email pushTokens expoPushTokens")
    .lean();

  const seenTokens = new Set();
  const messages = admins.flatMap((admin) => ([...(admin.pushTokens || []), ...(admin.expoPushTokens || [])])
    .map(tokenValue)
    .filter((token) => {
      if (!isExpoPushToken(token) || seenTokens.has(token)) return false;
      seenTokens.add(token);
      return true;
    })
    .map((token) => pushPayloadForToken(token, notification)));

  console.log("[push] Resolved admin Expo push recipients:", {
    requestedAdminIds: ids,
    matchedAdmins: admins.length,
    messageCount: messages.length,
    tokens: messages.map((message) => message.to),
  });

  if (!messages.length) return { sent: 0, tickets: [] };

  try {
    const tickets = await sendExpoPushMessages(messages);
    return { sent: messages.length, tickets };
  } catch (error) {
    console.error("Expo push notification failed:", { error: error.message });
    return { sent: 0, error };
  }
}

module.exports = {
  isExpoPushToken,
  removeInvalidExpoTokens,
  sendPushToAdmins,
};
