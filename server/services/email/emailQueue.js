const { logger } = require("../../utils/logger");
const { sendEmail } = require("./emailService");

const queue = [];
let processing = false;

function enqueueEmail(message, options = {}) {
  queue.push({ message, options, enqueuedAt: new Date() });
  setImmediate(processEmailQueue);
  return { queued: true, size: queue.length };
}

async function processEmailQueue() {
  if (processing) return;
  processing = true;

  try {
    while (queue.length) {
      const item = queue.shift();
      try {
        await sendEmail(item.message, item.options);
      } catch (error) {
        logger.error("email.queue_item_failed", {
          to: item.message?.to,
          subject: item.message?.subject,
          error: error.message,
        });
      }
    }
  } finally {
    processing = false;
    if (queue.length) setImmediate(processEmailQueue);
  }
}

module.exports = { enqueueEmail, processEmailQueue };
