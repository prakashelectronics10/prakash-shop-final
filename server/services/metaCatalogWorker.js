const env = require("../config/env");
const { logger } = require("../utils/logger");
const { processDueJobs } = require("./metaCatalogService");

let timer = null;
let running = false;

async function tick() {
  if (running) return;
  running = true;
  try {
    await processDueJobs();
  } catch (error) {
    logger.error("meta_catalog.worker_failed", { error: error.message });
  } finally {
    running = false;
  }
}

function startMetaCatalogWorker() {
  if (timer) return timer;
  const intervalMs = Math.max(5000, env.metaCatalog.workerIntervalMs);
  timer = setInterval(tick, intervalMs);
  timer.unref?.();
  setTimeout(tick, 1000).unref?.();
  logger.info("meta_catalog.worker_started", { intervalMs, concurrency: env.metaCatalog.concurrency });
  return timer;
}

function stopMetaCatalogWorker() {
  if (timer) clearInterval(timer);
  timer = null;
}

module.exports = { startMetaCatalogWorker, stopMetaCatalogWorker, tick };
