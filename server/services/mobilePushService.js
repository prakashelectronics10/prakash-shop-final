const Admin = require("../models/Admin");

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

function isExpoPushToken(token) {
  return /^(ExponentPushToken|ExpoPushToken)\[[^\]]+\]$/.test(String(token || "").trim());
}

function compactMessage(message) {
  return String(message || "").replace(/\s+/g, " ").trim().slice(0, 180);
}

function notificationBody(notification) {
  return compactMessage(notification.body || notification.message);
}

async function sendExpoPushMessages(messages) {
  const chunks = [];
  for (let index = 0; index < messages.length; index += 100) {
    chunks.push(messages.slice(index, index + 100));
  }

  await Promise.all(chunks.map(async (chunk) => {
    if (!chunk.length || typeof fetch !== "function") return;
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
  }));
}

async function sendPushToAdmins(adminIds, notification) {
  const ids = [...new Set((adminIds || []).map((id) => String(id || "")).filter(Boolean))];
  if (!ids.length) return { sent: 0 };

  const admins = await Admin.find({ _id: { $in: ids }, isActive: true })
    .select("pushTokens expoPushTokens")
    .lean();

  const messages = admins.flatMap((admin) => ([...(admin.pushTokens || []), ...(admin.expoPushTokens || [])])
    .filter((item) => isExpoPushToken(item.token))
    .map((item) => ({
      to: item.token,
      sound: "default",
      priority: "high",
      title: String(notification.title || "Prakash Electronics").slice(0, 80),
      body: notificationBody(notification),
      data: {
        screen: "notifications",
        notificationId: String(notification._id || ""),
        type: notification.type,
        ...(notification.data || {}),
      },
      channelId: "admin-alerts",
      categoryId: notification.categoryId,
    })));

  if (!messages.length) return { sent: 0 };

  try {
    await sendExpoPushMessages(messages);
    return { sent: messages.length };
  } catch (error) {
    console.error("Expo push notification failed:", { error: error.message });
    return { sent: 0, error };
  }
}

module.exports = {
  isExpoPushToken,
  sendPushToAdmins,
};
