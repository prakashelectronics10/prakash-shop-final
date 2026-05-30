const https = require("https");
const Admin = require("../models/Admin");

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const EXPO_RECEIPTS_URL = "https://exp.host/--/api/v2/push/getReceipts";
const DEFAULT_CHANNEL_ID = "bookings";

function isExpoPushToken(token) {
  return /^(ExponentPushToken|ExpoPushToken)\[[^\]]+\]$/.test(String(token || "").trim());
}

function compactMessage(message) {
  return String(message || "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, 700);
}

function notificationBody(notification) {
  return compactMessage(notification.body || notification.message);
}

function tokenValue(item) {
  if (!item) return "";
  return typeof item === "string" ? item : String(item.token || "").trim();
}

function notificationData(notification) {
  const image = notification.image || notification.deepLinkData?.image || notification.data?.image || "";
  return {
    screen: notification.screen || "notifications",
    notificationId: String(notification._id || ""),
    type: notification.type,
    image,
    ...(notification.deepLinkData || {}),
    ...(notification.data || {}),
  };
}

function pushPayloadForToken(token, notification) {
  const data = notificationData(notification);
  const channelByType = {
    booking: "bookings",
    review: "system_alerts",
    admin_request: "admin_requests",
    android_access_request: "admin_requests",
    discussion_message: "discussion",
    system: "system_alerts",
    warning: "system_alerts",
    success: "system_alerts",
  };
  const image = String(notification.image || data.image || notification.metadata?.image || "").trim();
  const payload = {
    to: token,
    sound: "default",
    title: String(notification.title || "Prakash Electronics").slice(0, 80),
    body: notificationBody(notification),
    data,
    priority: "high",
    channelId: notification.channelId || data.channelId || notification.metadata?.channelId || channelByType[notification.type] || DEFAULT_CHANNEL_ID,
    categoryId: notification.categoryId,
  };
  if (/^https?:\/\//i.test(image)) {
    payload.richContent = { image: image.replace(/^http:\/\//i, "https://") };
  }
  return payload;
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

function postJsonWithHttps(url, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const request = https.request(url, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload),
      },
      timeout: 15000,
    }, (response) => {
      let data = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => {
        data += chunk;
      });
      response.on("end", () => {
        let parsed = {};
        try {
          parsed = data ? JSON.parse(data) : {};
        } catch (_error) {
          parsed = { message: data };
        }
        if (response.statusCode < 200 || response.statusCode >= 300) {
          reject(new Error(`Expo push failed with status ${response.statusCode}: ${parsed.message || data || "No response body"}`));
          return;
        }
        resolve(parsed);
      });
    });
    request.on("timeout", () => request.destroy(new Error("Expo push request timed out")));
    request.on("error", reject);
    request.write(payload);
    request.end();
  });
}

async function postJson(url, body) {
  if (typeof fetch === "function") {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Accept-Encoding": "gzip, deflate",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(`Expo push failed with status ${response.status}: ${payload.message || "No response body"}`);
    }
    return payload;
  }
  console.warn("[push] Native fetch unavailable, using HTTPS fallback for Expo push request");
  return postJsonWithHttps(url, body);
}

async function fetchExpoReceipts(ticketIds) {
  const ids = [...new Set((ticketIds || []).filter(Boolean))];
  if (!ids.length) return {};
  const payload = await postJson(EXPO_RECEIPTS_URL, { ids });
  return payload.data || {};
}

function scheduleReceiptCheck(tickets) {
  const ticketIds = (tickets || [])
    .filter((ticket) => ticket?.status === "ok" && ticket.id)
    .map((ticket) => ticket.id);
  if (!ticketIds.length) return;
  setTimeout(() => {
    fetchExpoReceipts(ticketIds)
      .then(async (receipts) => {
        console.log("[push] Expo push receipts:", receipts);
        const invalidTokens = [];
        Object.entries(receipts || {}).forEach(([ticketId, receipt]) => {
          if (receipt?.status !== "error") return;
          const errorCode = receipt.details?.error || "";
          console.error("[push] Expo receipt error:", {
            ticketId,
            error: receipt.message,
            errorCode,
          });
          if (errorCode === "DeviceNotRegistered") {
            const ticket = tickets.find((item) => item.id === ticketId);
            if (ticket?.token) invalidTokens.push(ticket.token);
          }
        });
        if (invalidTokens.length) await removeInvalidExpoTokens(invalidTokens);
      })
      .catch((error) => {
        console.error("[push] Expo receipt check failed:", { error: error.message });
      });
  }, 45000).unref?.();
}

async function sendExpoPushMessages(messages) {
  const chunks = [];
  for (let index = 0; index < messages.length; index += 100) {
    chunks.push(messages.slice(index, index + 100));
  }

  const invalidTokens = [];
  const tickets = [];

  await Promise.all(chunks.map(async (chunk) => {
    if (!chunk.length) return;
    console.log("[push] Sending Expo push request:", {
      count: chunk.length,
      tokens: chunk.map((message) => message.to),
      channelId: chunk[0]?.channelId,
      samplePayload: chunk[0],
    });
    const payload = await postJson(EXPO_PUSH_URL, chunk);
    const responseTickets = Array.isArray(payload.data) ? payload.data : [];
    tickets.push(...responseTickets.map((ticket, index) => ({
      ...ticket,
      token: chunk[index]?.to,
    })));
    console.log("[push] Expo push response tickets:", responseTickets);
    responseTickets.forEach((ticket, index) => {
      if (ticket?.status === "error" && ticket?.details?.error === "DeviceNotRegistered") {
        invalidTokens.push(chunk[index]?.to);
      }
    });
  }));

  if (invalidTokens.length) await removeInvalidExpoTokens(invalidTokens);
  scheduleReceiptCheck(tickets);
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
    .filter((item) => item && (typeof item === "string" || item.active !== false))
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
