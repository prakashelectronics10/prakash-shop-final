const express = require("express");
const rateLimit = require("express-rate-limit");
const { chatWithScienceAI, scienceAIFavicon, scienceAIHealth } = require("../controllers/scienceAIController");

const router = express.Router();
const faviconLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: "draft-7",
  legacyHeaders: false,
});

// Science AI chat endpoint
router.post("/chat", chatWithScienceAI);

// Health check for Science AI
router.get("/health", scienceAIHealth);
router.get("/favicon", faviconLimiter, scienceAIFavicon);

module.exports = router;
