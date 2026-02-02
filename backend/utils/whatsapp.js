const fetch = require('node-fetch');
const logger = require('./logger');

// Configuration
const ADMIN_PHONE_NUMBERS = process.env.ADMIN_PHONES ? 
  process.env.ADMIN_PHONES.split(',') : 
  []; // Empty by default for security

// WhatsApp Provider Configuration
// Options: 'meta', 'msg91', 'both' (try meta first, fallback to msg91)
const WHATSAPP_PROVIDER = process.env.WHATSAPP_PROVIDER || 'both';

// Meta WhatsApp Cloud API Configuration
const WHATSAPP_API_URL = process.env.WHATSAPP_API_URL || 'https://graph.facebook.com/v17.0/YOUR_PHONE_NUMBER_ID/messages';
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN; // Meta Bearer token
const WHATSAPP_BUSINESS_ID = process.env.WHATSAPP_BUSINESS_ID;
const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID; // Your WhatsApp Phone Number ID

// MSG91 WhatsApp Configuration
const MSG91_AUTH_KEY = process.env.MSG91_AUTH_KEY;
const MSG91_WHATSAPP_SENDER = process.env.MSG91_WHATSAPP_SENDER; // Integrated Number or Name

// Check which providers are configured
const isMetaConfigured = !!(WHATSAPP_TOKEN && WHATSAPP_PHONE_NUMBER_ID);
const isMSG91Configured = !!(MSG91_AUTH_KEY && MSG91_WHATSAPP_SENDER);

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
 * Send WhatsApp message via Meta Cloud API
 */
const sendViaMeta = async (to, messageData) => {
  if (!WHATSAPP_TOKEN) {
    throw new Error('Meta WhatsApp token not configured. Set WHATSAPP_TOKEN in .env');
  }
  
  // Normalize phone number
  const normalizedPhone = to.replace(/[^0-9]/g, '');
  
  // Build the correct API URL
  const apiUrl = WHATSAPP_PHONE_NUMBER_ID 
    ? `https://graph.facebook.com/v17.0/${WHATSAPP_PHONE_NUMBER_ID}/messages`
    : WHATSAPP_API_URL;
  
  logger.info(`📱 [WhatsApp Meta] Sending to ${normalizedPhone}...`);
  
  const payload = {
    messaging_product: 'whatsapp',
    to: normalizedPhone,
    ...messageData
  };
  
  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  const data = await response.json();
  
  if (!response.ok) {
    const errorMsg = data.error?.message || JSON.stringify(data);
    logger.error(`❌ [WhatsApp Meta] Error: ${errorMsg}`);
    throw new Error(`Meta WhatsApp error: ${errorMsg}`);
  }
  
  logger.info(`✅ [WhatsApp Meta] Sent to ${normalizedPhone}, Message ID: ${data.messages?.[0]?.id}`);
  return { success: true, provider: 'meta', data };
};

/**
 * Core function to send WhatsApp message
 * Supports both Meta WhatsApp Cloud API and MSG91
 * @param {string} to - Phone number with country code
 * @param {object} messageData - Message payload
 */
const sendWhatsAppMessage = async (to, messageData) => {
  try {
    // If no configuration is found, log it for debugging
    if (!isMetaConfigured && !isMSG91Configured) {
      if (process.env.NODE_ENV === 'development') {
        logger.info(`📱 [WhatsApp Debug] No provider configured. To: ${to}`);
        logger.debug(`   Message:`, messageData);
      }
      return { success: false, error: 'WhatsApp provider not configured' };
    }

    const provider = WHATSAPP_PROVIDER.toLowerCase();
    
    // Use MSG91 only
    if (provider === 'msg91') {
      if (!isMSG91Configured) {
        throw new Error('MSG91 selected but not configured. Set MSG91_AUTH_KEY and MSG91_WHATSAPP_SENDER');
      }
      return await sendViaMSG91(to, messageData);
    }
    
    // Use Meta only
    if (provider === 'meta') {
      if (!isMetaConfigured) {
        throw new Error('Meta WhatsApp selected but not configured. Set WHATSAPP_TOKEN and WHATSAPP_PHONE_NUMBER_ID');
      }
      return await sendViaMeta(to, messageData);
    }
    
    // Use both (default) - try Meta first, fallback to MSG91
    if (provider === 'both' || !provider) {
      // Try Meta first if configured
      if (isMetaConfigured) {
        try {
          return await sendViaMeta(to, messageData);
        } catch (metaError) {
          logger.warn(`📱 [WhatsApp] Meta failed, trying MSG91: ${metaError.message}`);
          if (isMSG91Configured) {
            return await sendViaMSG91(to, messageData);
          }
          throw metaError; // No MSG91 fallback available
        }
      }
      
      // Try MSG91 if Meta not configured
      if (isMSG91Configured) {
        return await sendViaMSG91(to, messageData);
      }
    }

    throw new Error('No WhatsApp provider configured');
    
  } catch (error) {
    logger.error('Failed to send WhatsApp:', error.message);
    return { success: false, error: error.message };
  }
};

/**
 * Send WhatsApp via MSG91
 * Uses the newer MSG91 WhatsApp API v5
 */
const sendViaMSG91 = async (to, messageData) => {
  if (!MSG91_AUTH_KEY) {
    throw new Error('MSG91 API key not configured. Set MSG91_AUTH_KEY in .env');
  }
  
  if (!MSG91_WHATSAPP_SENDER) {
    throw new Error('MSG91 WhatsApp sender not configured. Set MSG91_WHATSAPP_SENDER in .env');
  }

  // Normalize phone number (ensure it has country code, no + sign)
  const normalizedPhone = to.replace(/[^0-9]/g, '');

  // MSG91 WhatsApp API supports templates and text messages
  let payload;
  
  // If it's a simple text message (session-based, requires 24-hour window)
  if (messageData.type === 'text') {
    payload = {
      integrated_number: MSG91_WHATSAPP_SENDER,
      content_type: 'text',
      payload: {
        messaging_product: 'whatsapp',
        to: normalizedPhone,
        type: 'text',
        text: {
          body: messageData.text.body
        }
      }
    };
  } else if (messageData.type === 'template' || messageData.template) {
    // Template message (can be sent anytime if user hasn't messaged in 24hrs)
    payload = {
      integrated_number: MSG91_WHATSAPP_SENDER,
      content_type: 'template',
      payload: {
        messaging_product: 'whatsapp',
        to: normalizedPhone,
        type: 'template',
        template: {
          name: messageData.template?.name || 'order_update',
          language: {
            code: messageData.template?.language?.code || 'en'
          },
          components: messageData.template?.components || []
        }
      }
    };
  } else {
    // Default to text if structure is unclear
    payload = {
      integrated_number: MSG91_WHATSAPP_SENDER,
      content_type: 'text',
      payload: {
        messaging_product: 'whatsapp',
        to: normalizedPhone,
        type: 'text',
        text: {
          body: typeof messageData === 'string' ? messageData : JSON.stringify(messageData)
        }
      }
    };
  }

  logger.info(`📱 [WhatsApp MSG91] Sending to ${normalizedPhone}...`);

  // Use the correct MSG91 WhatsApp API endpoint
  const response = await fetch('https://api.msg91.com/api/v5/whatsapp/whatsapp-outbound-message/', {
    method: 'POST',
    headers: {
      'authkey': MSG91_AUTH_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  const data = await response.json();
  
  logger.info(`📱 [WhatsApp MSG91] Response:`, JSON.stringify(data));
  
  if (data.type === 'error' || data.status === 'error' || !response.ok) {
    const errorMsg = data.message || data.msg || JSON.stringify(data);
    logger.error(`❌ [WhatsApp MSG91] Error: ${errorMsg}`);
    throw new Error(`MSG91 WhatsApp error: ${errorMsg}`);
  }
  
  logger.info(`✅ WhatsApp (MSG91) sent to ${normalizedPhone}`);
  return { success: true, response: data };
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
