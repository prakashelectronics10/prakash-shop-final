const express = require("express");
const { chatWithScienceAI, scienceAIHealth } = require("../controllers/scienceAIController");

const router = express.Router();

// Science AI chat endpoint
router.post("/chat", chatWithScienceAI);

// Health check for Science AI
router.get("/health", scienceAIHealth);

module.exports = router;