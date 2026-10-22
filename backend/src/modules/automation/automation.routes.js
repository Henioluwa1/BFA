const express = require('express');
const rateLimit = require('express-rate-limit');
const config = require('../../config');
const { requireAuth } = require('../../core/middleware/authContext');
const AutomationController = require('./automation.controller');

const router = express.Router();

// Dedicated automation rate limiter to defend against brute-force confirmation polling and denial-of-service
const automationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.AUTOMATION_RATE_LIMIT_MAX, 10) || 120,
  skip: () => config.app.isTest,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: 'AUTOMATION_RATE_LIMIT_EXCEEDED',
      message: 'Too many automation requests from this client. Please try again later.',
    },
  },
});

// All automation endpoints strictly require trusted authentication and rate limiting
router.use(requireAuth);
router.use(automationLimiter);

// 1. Action catalog inspection for current identity
router.get('/actions', AutomationController.listActions);

// 2. Action proposal or execution
router.post('/execute', AutomationController.execute);

// 3. Consequential action confirmation
router.post('/confirm', AutomationController.confirm);

// 4. Consequential action rejection / cancellation
router.post('/cancel', AutomationController.cancel);

// 5. Intelligent text assistant chat interface
router.post('/assistant/chat', AutomationController.chatWithAssistant);

module.exports = router;
