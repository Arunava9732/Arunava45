/**
 * Webhook Routes for Order Events
 * Example: POST /api/webhooks/order
 */

const express = require('express');
const router = express.Router();
const db = require('../utils/database');
const logger = require('../utils/logger');

// Registered webhook URLs (in-memory for demo, use DB in production)
const webhookUrls = [
  // 'https://your-service.com/webhook-endpoint'
];

const fetch = require('node-fetch');

// Helper to send webhook
async function sendOrderWebhook(event, order) {
  for (const url of webhookUrls) {
    try {
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event, order })
      });
      logger.info(`Webhook sent to ${url} for event ${event}`);
    } catch (e) {
      logger.error(`Webhook failed for ${url}: ${e.message}`);
    }
  }
}

// Public endpoint to receive webhooks (for testing)
router.post('/order', (req, res) => {
  logger.info('Received webhook:', req.body);
  res.json({ success: true });
});

module.exports = { router: router, sendOrderWebhook };
