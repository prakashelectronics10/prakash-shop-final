const crypto = require("crypto");
const https = require("https");
const Admin = require("../models/Admin");
const env = require("../config/env");

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const EXPO_RECEIPTS_URL = "https://exp.host/--/api/v2/push/getReceipts";
const DEFAULT_CHANNEL_ID = "bookings";
const FIREBASE_SCOPE = "https://www.googleapis.com/auth/firebase.messaging";
const FIREBASE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const PUSH_IMAGE_TRANSFORMATION = "f_auto,q_auto:eco,c_limit,w_720";

let firebaseAccessToken = "";
let firebaseAccessTokenExpiresAt = 0;

function isExpoPushToken(token) {
  return /^(ExponentPushToken|ExpoPushToken)\[[^\]]+\]$/.test(String(token || "").trim());
}

function firebaseCredentials() {
  let fromJson = {};
  if (env.firebase.serviceAccountJson) {
    try {
      fromJson = JSON.parse(env.firebase.serviceAccountJson);
    } catch (error) {
      console.error("[push] FIREBASE_SERVICE_ACCOUNT_JSON parse failed:", { error: error.message });
    }
  }
  const projectId = env.firebase.projectId || fromJson.project_id || "";
  const clientEmail = env.firebase.clientEmail || fromJson.client_email || "";
  const privateKey = env.firebase.privateKey || String(fromJson.private_key || "").replace(/\\n/g, "\n");
  return { projectId, clientEmail, privateKey };
}

function isFirebaseConfigured() {
  const credentials = firebaseCredentials();
  return Boolean(credentials.projectId && credentials.clientEmail && credentials.privateKey);
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

function isCloudinaryTransformationSegment(segment = "") {
  return /[,]/.test(segment) || /^(?:a|ar|b|bo|c|co|cs|d|dn|dpr|e|f|fl|fn|g|h|l|o|p|pg|q|r|t|u|w|x|y|z)_/i.test(segment);
}

function pushImageUrl(value) {
  const url = String(value || "").trim().replace(/^http:\/\//i, "https://");
  if (!/^https:\/\//i.test(url)) return "";

  if (/^https:\/\/res\.cloudinary\.com\//i.test(url) && url.includes("/image/upload/")) {
    const [prefix, rest = ""] = url.split("/image/upload/");
    const parts = rest.split("/").filter(Boolean);
    while (parts.length && isCloudinaryTransformationSegment(parts[0])) {
      parts.shift();
    }
    if (parts.length) return `${prefix}/image/upload/${PUSH_IMAGE_TRANSFORMATION}/${parts.join("/")}`;
  }

  return url;
}

function notificationData(notification) {
  const image = pushImageUrl(notification.image || notification.deepLinkData?.image || notification.data?.image || notification.metadata?.image || "");
  return {
    screen: notification.screen || "notifications",
    notificationId: String(notification._id || ""),
    type: notification.type,
    ...(notification.deepLinkData || {}),
    ...(notification.data || {}),
    image,
  };
}

function stringData(data = {}) {
  return Object.fromEntries(Object.entries(data)
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([key, value]) => [key, typeof value === "string" ? value : JSON.stringify(value)]));
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
  const image = pushImageUrl(notification.image || data.image || notification.metadata?.image || "");
  const tag = String(notification.tag || data.tag || notification.metadata?.tag || "").trim();
  const collapseKey = String(notification.collapseKey || data.collapseKey || notification.metadata?.collapseKey || tag || "").trim();
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
  if (tag) payload.data = { ...payload.data, tag };
  if (collapseKey) payload.data = { ...payload.data, collapseKey };
  if (/^https?:\/\//i.test(image)) {
    payload.richContent = { image };
  }
  return payload;
}

function fcmMessageForToken(token, notification) {
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
  const channelId = notification.channelId || data.channelId || notification.metadata?.channelId || channelByType[notification.type] || DEFAULT_CHANNEL_ID;
  const image = pushImageUrl(notification.image || data.image || notification.metadata?.image || "");
  const title = String(notification.title || "Prakash Electronics").slice(0, 80);
  const body = notificationBody(notification);
  const tag = String(notification.tag || data.tag || notification.metadata?.tag || "").trim();
  const collapseKey = String(notification.collapseKey || data.collapseKey || notification.metadata?.collapseKey || tag || "").trim();
  return {
    token,
    notification: {
      title,
      body,
      ...(image && /^https?:\/\//i.test(image) ? { image } : {}),
    },
    data: stringData({ ...data, channelId, image }),
    android: {
      ...(collapseKey ? { collapse_key: collapseKey } : {}),
      priority: "HIGH",
      ttl: "60s",
      notification: {
        title,
        body,
        channel_id: channelId,
        sound: "default",
        notification_priority: "PRIORITY_MAX",
        visibility: "PUBLIC",
        ...(tag ? { tag } : {}),
        ...(image && /^https?:\/\//i.test(image) ? { image } : {}),
      },
    },
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

async function removeInvalidFcmTokens(tokens) {
  const invalidTokens = [...new Set((tokens || []).map(tokenValue).filter(Boolean))];
  if (!invalidTokens.length) return;
  await Admin.updateMany(
    {},
    {
      $pull: {
        fcmPushTokens: { token: { $in: invalidTokens } },
      },
    },
  );
  console.warn("[push] Removed invalid FCM push tokens:", invalidTokens);
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

async function postForm(url, form, headers = {}) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
      ...headers,
    },
    body: new URLSearchParams(form).toString(),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Firebase auth failed with status ${response.status}: ${payload.error_description || payload.error || "No response body"}`);
  }
  return payload;
}

async function postFirebaseJson(url, body, accessToken) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(`Firebase push failed with status ${response.status}: ${payload.error?.message || payload.message || "No response body"}`);
    error.payload = payload;
    throw error;
  }
  return payload;
}

function base64url(value) {
  return Buffer.from(value).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

async function getFirebaseAccessToken() {
  if (firebaseAccessToken && Date.now() < firebaseAccessTokenExpiresAt - 60000) {
    return firebaseAccessToken;
  }
  const credentials = firebaseCredentials();
  if (!credentials.projectId || !credentials.clientEmail || !credentials.privateKey) {
    throw new Error("Firebase service account credentials are missing");
  }
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = base64url(JSON.stringify({
    iss: credentials.clientEmail,
    scope: FIREBASE_SCOPE,
    aud: FIREBASE_TOKEN_URL,
    iat: now,
    exp: now + 3600,
  }));
  const unsigned = `${header}.${claim}`;
  const signature = crypto.createSign("RSA-SHA256").update(unsigned).sign(credentials.privateKey, "base64")
    .replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  const assertion = `${unsigned}.${signature}`;
  const payload = await postForm(FIREBASE_TOKEN_URL, {
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion,
  });
  firebaseAccessToken = payload.access_token || "";
  firebaseAccessTokenExpiresAt = Date.now() + Number(payload.expires_in || 3600) * 1000;
  return firebaseAccessToken;
}

async function sendFcmMessages(messages) {
  if (!messages.length) return [];
  const credentials = firebaseCredentials();
  const accessToken = await getFirebaseAccessToken();
  const invalidTokens = [];
  const results = [];
  console.log("[push] Sending Firebase FCM push request:", {
    count: messages.length,
    tokens: messages.map((message) => message.token),
    projectId: credentials.projectId,
    channelId: messages[0]?.android?.notification?.channel_id,
  });
  await Promise.all(messages.map(async (message) => {
    try {
      const result = await postFirebaseJson(
        `https://fcm.googleapis.com/v1/projects/${credentials.projectId}/messages:send`,
        { message },
        accessToken,
      );
      results.push({ status: "ok", token: message.token, id: result.name });
    } catch (error) {
      const status = error.payload?.error?.status || "";
      const messageText = error.payload?.error?.message || error.message;
      results.push({ status: "error", token: message.token, message: messageText, error: status });
      if (/UNREGISTERED|INVALID_ARGUMENT|not a valid FCM registration token/i.test(`${status} ${messageText}`)) {
        invalidTokens.push(message.token);
      }
    }
  }));
  if (invalidTokens.length) await removeInvalidFcmTokens(invalidTokens);
  console.log("[push] Firebase FCM push response:", results);
  return results;
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
  const senderId = String(notification?.senderId || notification?.senderAdmin || notification?.metadata?.senderId || "").trim();

  let admins = await Admin.find({ _id: { $in: ids }, isActive: true })
    .select("_id email pushTokens expoPushTokens fcmPushTokens")
    .lean();
  if (notification?.type === "discussion_message" && senderId) {
    const beforeCount = admins.length;
    admins = admins.filter((admin) => String(admin._id) !== senderId);
    if (beforeCount !== admins.length) {
      console.log("[push] Discussion sender push skipped:", {
        senderId,
        notificationId: String(notification?._id || ""),
        requestedAdminIds: ids,
      });
    }
  }

  const firebaseReady = isFirebaseConfigured();
  const seenFcmTokens = new Set();
  const seenExpoTokens = new Set();
  const fcmMessages = [];
  const expoMessages = [];
  const expoFallbackMessages = [];

  admins.forEach((admin) => {
    const fcmTokens = [...(admin.fcmPushTokens || [])]
      .filter((item) => item && (typeof item === "string" || item.active !== false))
      .map(tokenValue)
      .filter((token) => {
        if (!token || seenFcmTokens.has(token)) return false;
        seenFcmTokens.add(token);
        return true;
      });

    const expoTokens = [...(admin.pushTokens || []), ...(admin.expoPushTokens || [])]
      .filter((item) => item && (typeof item === "string" || item.active !== false))
      .map(tokenValue)
      .filter((token) => {
        if (!isExpoPushToken(token) || seenExpoTokens.has(token)) return false;
        seenExpoTokens.add(token);
        return true;
      })
      .map((token) => pushPayloadForToken(token, notification));

    if (firebaseReady && fcmTokens.length) {
      fcmMessages.push(...fcmTokens.map((token) => fcmMessageForToken(token, notification)));
      expoFallbackMessages.push(...expoTokens);
      return;
    }

    expoMessages.push(...expoTokens);
  });

  console.log("[push] Resolved admin push recipients:", {
    requestedAdminIds: ids,
    matchedAdmins: admins.length,
    firebaseConfigured: firebaseReady,
    fcmMessageCount: fcmMessages.length,
    expoMessageCount: expoMessages.length,
    fcmTokens: fcmMessages.map((message) => message.token),
    expoTokens: expoMessages.map((message) => message.to),
  });

  if (!fcmMessages.length && !expoMessages.length) return { sent: 0, tickets: [] };

  try {
    const fcmTickets = fcmMessages.length ? await sendFcmMessages(fcmMessages) : [];
    const fcmDelivered = fcmTickets.some((ticket) => ticket?.status === "ok");
    const fallbackMessages = fcmMessages.length && !fcmDelivered ? expoFallbackMessages : [];
    const expoTickets = (expoMessages.length || fallbackMessages.length)
      ? await sendExpoPushMessages([...expoMessages, ...fallbackMessages])
      : [];
    return { sent: fcmMessages.length + expoMessages.length, tickets: [...fcmTickets, ...expoTickets] };
  } catch (error) {
    console.error("Push notification failed:", { error: error.message });
    if (expoMessages.length || expoFallbackMessages.length) {
      const expoTickets = await sendExpoPushMessages([...expoMessages, ...expoFallbackMessages]).catch((fallbackError) => {
        console.error("Expo fallback push failed:", { error: fallbackError.message });
        return [];
      });
      return { sent: expoTickets.length, tickets: expoTickets, error };
    }
    return { sent: 0, error };
  }
}

module.exports = {
  isExpoPushToken,
  removeInvalidExpoTokens,
  sendPushToAdmins,
};
