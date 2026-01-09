const fetch = require('node-fetch');
const logger = require('./logger');

// Configuration
const ADMIN_PHONE_NUMBERS = ['919732726750', '918670328717']; // Multiple admin numbers
const WHATSAPP_API_URL = process.env.WHATSAPP_API_URL || 'https://graph.facebook.com/v17.0/YOUR_PHONE_NUMBER_ID/messages';
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN; // Bearer token
const WHATSAPP_BUSINESS_ID = process.env.WHATSAPP_BUSINESS_ID || '940350725827869';

// Message Templates
const TEMPLATES = {
  ORDER_CONFIRMATION: 'order_confirmation',
  ORDER_SHIPPED: 'order_shipped',
  ORDER_DELIVERED: 'order_delivered',
  PASSWORD_RESET: 'password_reset',
  PROMOTIONAL: 'promotional_message',
  RETURN_APPROVED: 'return_approved'
};

/**
 * Core function to send WhatsApp message
 * @param {string} to - Phone number with country code
 * @param {object} messageData - Message payload
 */
const sendWhatsAppMessage = async (to, messageData) => {
  try {
    // If no token is configured, just log it (Development mode)
    if (!WHATSAPP_TOKEN) {
      logger.info(`📱 [WhatsApp Mock] To: ${to}`);
      logger.info(`   Message:`, messageData);
      return { success: true, mock: true };
    }

    const response = await fetch(WHATSAPP_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: to,
        ...messageData
      })
    });

    const data = await response.json();
    
    if (!response.ok) {
      logger.error('WhatsApp API Error:', data);
      return { success: false, error: data };
    }
    
    logger.info(`✅ WhatsApp sent to ${to}`);
    return { success: true, data };
    
  } catch (error) {
    logger.error('Failed to send WhatsApp:', error.message);
    return { success: false, error: error.message };
  }
};

/**
 * Send text message
 */
const sendTextMessage = async (to, message) => {
  return sendWhatsAppMessage(to, {
    type: 'text',
    text: { body: message }
  });
};

/**
 * Send message with buttons
 */
const sendButtonMessage = async (to, bodyText, buttons) => {
  return sendWhatsAppMessage(to, {
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: bodyText },
      action: {
        buttons: buttons.map((btn, idx) => ({
          type: 'reply',
          reply: {
            id: btn.id || `btn_${idx}`,
            title: btn.title
          }
        }))
      }
    }
  });
};

/**
 * Send message with list
 */
const sendListMessage = async (to, bodyText, buttonText, sections) => {
  return sendWhatsAppMessage(to, {
    type: 'interactive',
    interactive: {
      type: 'list',
      body: { text: bodyText },
      action: {
        button: buttonText,
        sections: sections
      }
    }
  });
};

/**
 * Send template message
 */
const sendTemplateMessage = async (to, templateName, languageCode, components) => {
  return sendWhatsAppMessage(to, {
    type: 'template',
    template: {
      name: templateName,
      language: { code: languageCode || 'en' },
      components: components || []
    }
  });
};

/**
 * Send media message (image, video, document)
 */
const sendMediaMessage = async (to, mediaType, mediaUrl, caption) => {
  const mediaData = {
    link: mediaUrl
  };
  
  if (caption) {
    mediaData.caption = caption;
  }
  
  return sendWhatsAppMessage(to, {
    type: mediaType, // 'image', 'video', 'document', 'audio'
    [mediaType]: mediaData
  });
};

/**
 * Send location message
 */
const sendLocationMessage = async (to, latitude, longitude, name, address) => {
  return sendWhatsAppMessage(to, {
    type: 'location',
    location: {
      latitude,
      longitude,
      name,
      address
    }
  });
};

/**
 * Send a WhatsApp message to all admins
 */
const sendAdminNotification = async (message) => {
  const results = [];
  
  for (const adminNumber of ADMIN_PHONE_NUMBERS) {
    const result = await sendTextMessage(adminNumber, message);
    results.push({ number: adminNumber, ...result });
  }
  
  return results;
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

// ============ USER NOTIFICATIONS ============

/**
 * Send order confirmation to user
 */
const sendOrderConfirmationToUser = async (phone, order) => {
  const message = formatOrderMessage(order);
  return sendTextMessage(phone, message);
};

/**
 * Send order confirmation with buttons
 */
const sendOrderConfirmationWithButtons = async (phone, order) => {
  const message = `✅ *Order Confirmed!*\n\nOrder ID: ${order.id}\nTotal: ₹${order.total}\n\nWe're preparing your order!`;
  
  return sendButtonMessage(phone, message, [
    { id: 'track', title: '📦 Track Order' },
    { id: 'support', title: '💬 Contact Support' }
  ]);
};

/**
 * Send order shipped notification
 */
const sendOrderShipped = async (phone, order, trackingUrl) => {
  const message = `🚚 *Order Shipped!*

Order ID: ${order.id}
Tracking: ${trackingUrl || 'Available soon'}

Your order is on its way!
Expected delivery: 3-5 business days

Track your order: https://blackonn.com/track/${order.id}`;

  return sendTextMessage(phone, message);
};

/**
 * Send order delivered notification
 */
const sendOrderDelivered = async (phone, order) => {
  const message = `✅ *Order Delivered!*

Order ID: ${order.id}

Thank you for shopping with BLACKONN!

Rate your experience: https://blackonn.com/review/${order.id}`;

  return sendButtonMessage(phone, message, [
    { id: 'review', title: '⭐ Write Review' },
    { id: 'shop', title: '🛍️ Shop More' }
  ]);
};

/**
 * Send payment reminder
 */
const sendPaymentReminder = async (phone, order) => {
  const message = `⏰ *Payment Reminder*

Order ID: ${order.id}
Amount: ₹${order.total}
Status: Pending

Complete payment: https://blackonn.com/payment/${order.id}`;

  return sendTextMessage(phone, message);
};

/**
 * Send return/refund status update
 */
const sendReturnStatusUpdate = async (phone, returnRequest) => {
  const message = `↩️ *Return Status Update*

Order ID: ${returnRequest.orderId}
Status: ${returnRequest.status}
${returnRequest.status === 'approved' ? '\nRefund will be processed in 5-7 business days' : ''}

View details: https://blackonn.com/returns/${returnRequest.id}`;

  return sendTextMessage(phone, message);
};

/**
 * Send promotional offer
 */
const sendPromotionalOffer = async (phone, offerDetails) => {
  const message = `🎉 *Special Offer for You!*

${offerDetails.title}

${offerDetails.description}

Use code: *${offerDetails.couponCode}*
Valid till: ${offerDetails.validTill}

Shop now: https://blackonn.com/offers`;

  return sendTextMessage(phone, message);
};

/**
 * Send back-in-stock notification
 */
const sendBackInStock = async (phone, product) => {
  const message = `🔔 *Back in Stock!*

${product.name} is now available!

Price: ₹${product.price}
Stock: Limited

Shop now: https://blackonn.com/products/${product.id}`;

  return sendButtonMessage(phone, message, [
    { id: 'buy', title: '🛒 Buy Now' },
    { id: 'view', title: '👁️ View Product' }
  ]);
};

/**
 * Send price drop alert
 */
const sendPriceDropAlert = async (phone, product, oldPrice) => {
  const discount = Math.round(((oldPrice - product.price) / oldPrice) * 100);
  
  const message = `💰 *Price Drop Alert!*

${product.name}

Was: ₹${oldPrice}
Now: ₹${product.price}
Save: ${discount}%!

Limited time offer!
https://blackonn.com/products/${product.id}`;

  return sendTextMessage(phone, message);
};

/**
 * Send OTP verification
 */
const sendOTP = async (phone, otp, purpose = 'verification') => {
  const message = `🔐 *BLACKONN Verification*

Your OTP: *${otp}*

Purpose: ${purpose}
Valid for: 10 minutes

Do not share this OTP with anyone.`;

  return sendTextMessage(phone, message);
};

/**
 * Send welcome message to new user
 */
const sendWelcomeMessage = async (phone, userName) => {
  const message = `👋 *Welcome to BLACKONN, ${userName}!*

Thank you for joining us!

🎁 Get 10% off on your first order
Use code: *WELCOME10*

Start shopping: https://blackonn.com`;

  return sendButtonMessage(phone, message, [
    { id: 'shop', title: '🛍️ Start Shopping' },
    { id: 'offers', title: '🎉 View Offers' }
  ]);
};

/**
 * Send abandoned cart reminder
 */
const sendAbandonedCartReminder = async (phone, cart, userName) => {
  const total = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const itemCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  
  const message = `🛒 *Don't forget your cart!*

Hi ${userName}, you have ${itemCount} item(s) waiting!

Cart Total: ₹${total}

Complete your purchase: https://blackonn.com/cart

Hurry! Items are selling fast!`;

  return sendTextMessage(phone, message);
};

/**
 * Send bulk message to multiple users
 */
const sendBulkMessage = async (phoneNumbers, message, delay = 1000) => {
  const results = [];
  
  for (let i = 0; i < phoneNumbers.length; i++) {
    const result = await sendTextMessage(phoneNumbers[i], message);
    results.push({ phone: phoneNumbers[i], ...result });
    
    // Add delay to avoid rate limiting
    if (i < phoneNumbers.length - 1) {
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  return results;
};

// ============ ADMIN NOTIFICATIONS ============

/**
 * Send new order alert to admin
 */
const notifyAdminNewOrder = async (order) => {
  const message = formatOrderMessage(order);
  return sendAdminNotification(message);
};

/**
 * Send low stock alert to admin
 */
const notifyAdminLowStock = async (product) => {
  const message = formatLowStockMessage(product);
  return sendAdminNotification(message);
};

/**
 * Send new return request to admin
 */
const notifyAdminReturn = async (returnRequest) => {
  const message = formatReturnMessage(returnRequest);
  return sendAdminNotification(message);
};

/**
 * Send contact query to admin
 */
const notifyAdminContact = async (contact) => {
  const message = formatContactMessage(contact);
  return sendAdminNotification(message);
};

/**
 * Send critical alert to admin
 */
const sendCriticalAlert = async (alertType, details) => {
  const message = `🚨 *CRITICAL ALERT*

Type: ${alertType}
Time: ${new Date().toLocaleString()}

Details:
${details}

Action required immediately!`;

  return sendAdminNotification(message);
};

module.exports = {
  // Core functions
  sendWhatsAppMessage,
  sendTextMessage,
  sendButtonMessage,
  sendListMessage,
  sendTemplateMessage,
  sendMediaMessage,
  sendLocationMessage,
  
  // Admin notifications
  sendAdminNotification,
  notifyAdminNewOrder,
  notifyAdminLowStock,
  notifyAdminReturn,
  notifyAdminContact,
  sendCriticalAlert,
  
  // User notifications
  sendOrderConfirmationToUser,
  sendOrderConfirmationWithButtons,
  sendOrderShipped,
  sendOrderDelivered,
  sendPaymentReminder,
  sendReturnStatusUpdate,
  sendPromotionalOffer,
  sendBackInStock,
  sendPriceDropAlert,
  sendOTP,
  sendWelcomeMessage,
  sendAbandonedCartReminder,
  sendBulkMessage,
  
  // Formatters
  formatOrderMessage,
  formatReturnMessage,
  formatLowStockMessage,
  formatContactMessage,
  
  // Constants
  TEMPLATES
};
