const { logger } = require("../utils/logger");

/** @type {Set<{ res: import('express').Response, accountId: string, conversationId: string }>} */
const clients = new Set();

function addClient(res, { accountId = "", conversationId = "" } = {}) {
  const client = { res, accountId: String(accountId || ""), conversationId: String(conversationId || "") };
  clients.add(client);
  res.on("close", () => {
    clients.delete(client);
  });
  return client;
}

function publishWhatsAppEvent(event, payload = {}) {
  const data = JSON.stringify({ event, payload, at: new Date().toISOString() });
  const accountId = String(payload.accountId || payload.conversation?.accountId || "");
  const conversationId = String(payload.conversationId || payload.conversation?.id || payload.message?.conversationId || "");

  let sent = 0;
  for (const client of clients) {
    if (client.accountId && accountId && client.accountId !== accountId) continue;
    if (client.conversationId && conversationId && client.conversationId !== conversationId) {
      // Still notify list updates for account-level listeners without conversation filter
      if (client.conversationId) continue;
    }
    try {
      client.res.write(`event: ${event}\ndata: ${data}\n\n`);
      sent += 1;
    } catch (error) {
      logger.warn("whatsapp.sse.write_failed", { message: error.message });
      clients.delete(client);
    }
  }
  return sent;
}

function publishConversationUpsert(conversation) {
  return publishWhatsAppEvent("whatsapp:conversation", {
    accountId: conversation.accountId || conversation.account,
    conversation,
  });
}

function publishMessage(message, conversation) {
  return publishWhatsAppEvent("whatsapp:message", {
    accountId: conversation?.accountId || message.accountId,
    conversationId: message.conversationId || conversation?.id,
    message,
    conversation,
  });
}

function publishReaction(message, conversation) {
  return publishWhatsAppEvent("whatsapp:reaction", {
    accountId: conversation?.accountId || message.accountId,
    conversationId: message.conversationId || conversation?.id,
    message,
    conversation,
  });
}

module.exports = {
  addClient,
  publishWhatsAppEvent,
  publishConversationUpsert,
  publishMessage,
  publishReaction,
};
