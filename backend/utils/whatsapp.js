const fetch = require('node-fetch');

// Configuration
const ADMIN_PHONE_NUMBER = '919732726750,918670328717'; // The number to send notifications to
const WHATSAPP_API_URL = process.env.WHATSAPP_API_URL || 'https://graph.facebook.com/v17.0/940350725827869,940350725827869/messages';
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN; // Bearer token

/**
 * Send a WhatsApp message to the admin
 * @param {string} message - The text message to send
 */
const sendAdminNotification = async (message) => {
  try {
    // If no token is configured, just log it (Development mode)
    if (!WHATSAPP_TOKEN) {
      console.log('📱 [WhatsApp Mock] To:', ADMIN_PHONE_NUMBER);
      console.log('   Message:', message);
      return;
    }

    const response = await fetch(WHATSAPP_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: ADMIN_PHONE_NUMBER,
        type: 'text',
        text: { body: message }
      })
    });

    const data = await response.json();
    if (!response.ok) {
      console.error('WhatsApp API Error:', data);
    } else {
      console.log('✅ WhatsApp notification sent to admin');
    }
  } catch (error) {
    console.error('Failed to send WhatsApp notification:', error.message);
  }
};

/**
 * Format order details for WhatsApp
 * @param {object} order 
 */
const formatOrderMessage = (order) => {
  const itemsList = order.items.map(i => `- ${i.name} (x${i.quantity}) - ₹${i.price}`).join('\n');
  return `📦 *New Order Received!*
Order ID: ${order.id}
Customer: ${order.shippingInfo.name}
Phone: ${order.shippingInfo.phone}
Amount: ₹${order.total}
Payment: ${order.paymentMethod}

*Items:*
${itemsList}

View details: https://blackonn.com/admin.html`;
};

/**
 * Format return request details for WhatsApp
 * @param {object} returnRequest 
 */
const formatReturnMessage = (returnRequest) => {
  return `↩️ *New Return Request*
Order ID: ${returnRequest.orderId}
Reason: ${returnRequest.reason}
Status: ${returnRequest.status}

View details: https://blackonn.com/admin.html`;
};

/**
 * Format low stock alert for WhatsApp
 * @param {object} product 
 */
const formatLowStockMessage = (product) => {
  return `⚠️ *Low Stock Alert*
Product: ${product.name}
Current Stock: ${product.stock}
ID: ${product.id}

Please restock soon!`;
};

/**
 * Format contact query for WhatsApp
 * @param {object} contact 
 */
const formatContactMessage = (contact) => {
  return `📩 *New Customer Query*
Query #: ${contact.queryNumber}
Name: ${contact.name}
Email: ${contact.email}
Subject: ${contact.subject}

*Message:*
${contact.message}

View details: https://blackonn.com/admin.html`;
};

module.exports = {
  sendAdminNotification,
  formatOrderMessage,
  formatReturnMessage,
  formatLowStockMessage,
  formatContactMessage
};
