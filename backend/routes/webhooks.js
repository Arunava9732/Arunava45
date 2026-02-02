/**
 * Webhook Routes for Order Events
 * Example: POST /api/webhooks/order
 */

const express = require('express');
const router = express.Router();
const { Database } = require('../utils/database');
const logger = require('../utils/logger');

// Registered webhook URLs (loaded from database)
const webhookDb = new Database('webhooks');

const fetch = require('node-fetch');

// Helper to send webhook
async function sendOrderWebhook(event, order) {
  const webhookUrls = await webhookDb.findAll();
  
  for (const webhook of webhookUrls) {
    const url = typeof webhook === 'string' ? webhook : webhook.url;
    if (!url) continue;
    
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
