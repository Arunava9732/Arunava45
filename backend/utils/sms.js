/**
 * SMS Utility for BLACKONN E-Commerce
 * Support for multiple SMS providers: Twilio, MSG91, TextLocal, etc.
 */

const fetch = require('node-fetch');
const logger = require('./logger');

// SMS Provider Configuration
const SMS_PROVIDER = process.env.SMS_PROVIDER || 'twilio'; // 'twilio', 'msg91', 'textlocal', 'custom'

// Twilio Configuration
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER;

// MSG91 Configuration
const MSG91_AUTH_KEY = process.env.MSG91_AUTH_KEY;
const MSG91_SENDER_ID = process.env.MSG91_SENDER_ID || 'BLKONN';
const MSG91_ROUTE = process.env.MSG91_ROUTE || '4'; // 4 = Transactional

// TextLocal Configuration
const TEXTLOCAL_API_KEY = process.env.TEXTLOCAL_API_KEY;
const TEXTLOCAL_SENDER = process.env.TEXTLOCAL_SENDER || 'BLKONN';

// Admin phone numbers
const ADMIN_PHONE_NUMBERS = process.env.ADMIN_PHONES ? 
  process.env.ADMIN_PHONES.split(',') : 
  ['919732726750', '918670328717'];

/**
 * Send SMS via Twilio
 */
const sendViaTwilio = async (to, message) => {
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_PHONE_NUMBER) {
    throw new Error('Twilio credentials not configured');
  }

  const auth = Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64');
  
  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        To: to,
        From: TWILIO_PHONE_NUMBER,
        Body: message
      })
    }
  );

  const data = await response.json();
  
  if (!response.ok) {
    throw new Error(data.message || 'Twilio SMS failed');
  }
  
  return data;
};

/**
 * Send SMS via MSG91
 * Supports both Flow API (DLT compliant) and direct send
 */
const sendViaMSG91 = async (to, message) => {
  if (!MSG91_AUTH_KEY) {
    throw new Error('MSG91 API key not configured. Set MSG91_AUTH_KEY in .env');
  }

  // Normalize phone number (ensure it has country code, no + sign)
  const normalizedPhone = to.replace(/[^0-9]/g, '');
  
  logger.info(`📱 [SMS MSG91] Sending to ${normalizedPhone}...`);

  // Modern MSG91 Flow API (v5) is preferred for DLT compliance in India
  // If no flow ID is provided, fallback to standard send (which might fail without DLT)
  const FLOW_ID = process.env.MSG91_FLOW_ID;

  if (FLOW_ID) {
    // Extract OTP from message if present (for OTP templates)
    const otpMatch = message.match(/\d{4,6}/);
    const otp = otpMatch ? otpMatch[0] : null;
    
    // Extract any numbers for variables (order ID, amount, etc.)
    const numbers = message.match(/\d+/g) || [];
    
    const payload = {
      flow_id: FLOW_ID,
      sender: MSG91_SENDER_ID,
      mobiles: normalizedPhone,
      // Common template variables - adjust based on your MSG91 template
      VAR1: otp || numbers[0] || '',      // Usually OTP or main number
      VAR2: numbers[1] || '',              // Secondary number (order ID, amount)
      VAR3: numbers[2] || '',              // Tertiary number
      message: message                      // Some templates use 'message' variable
    };
    
    // If message contains OTP, add it explicitly
    if (otp) {
      payload.otp = otp;
    }

    logger.info(`📱 [SMS MSG91] Using Flow API with ID: ${FLOW_ID}`);
    
    const response = await fetch('https://api.msg91.com/api/v5/flow/', {
      method: 'POST',
      headers: {
        'authkey': MSG91_AUTH_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    
    const data = await response.json();
    logger.info(`📱 [SMS MSG91] Response:`, JSON.stringify(data));
    
    if (data.type === 'error' || !response.ok) {
      const errorMsg = data.message || JSON.stringify(data);
      logger.error(`❌ [SMS MSG91] Flow Error: ${errorMsg}`);
      throw new Error(`MSG91 Flow Error: ${errorMsg}`);
    }
    
    logger.info(`✅ SMS (MSG91 Flow) sent to ${normalizedPhone}`);
    return { success: true, response: data };
  }

  // Fallback to older POST API but with better error handling
  const response = await fetch('https://api.msg91.com/api/sendhttp.php', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
      authkey: MSG91_AUTH_KEY,
      mobiles: to,
      message: message,
      sender: MSG91_SENDER_ID,
      route: MSG91_ROUTE,
      country: '91'
    })
  });

  const data = await response.text();
  
  if (data.includes('error') || !response.ok) {
    logger.error('MSG91 API Response:', data);
    throw new Error(`MSG91 error: ${data}`);
  }
  
  return { success: true, response: data };
};

/**
 * Send SMS via TextLocal
 */
const sendViaTextLocal = async (to, message) => {
  if (!TEXTLOCAL_API_KEY) {
    throw new Error('TextLocal API key not configured');
  }

  const response = await fetch('https://api.textlocal.in/send/', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
      apikey: TEXTLOCAL_API_KEY,
      numbers: to,
      message: message,
      sender: TEXTLOCAL_SENDER
    })
  });

  const data = await response.json();
  
  if (data.status !== 'success') {
    throw new Error(data.errors?.[0]?.message || 'TextLocal SMS failed');
  }
  
  return data;
};

/**
 * Core SMS sending function
 */
const sendSMS = async (to, message) => {
  try {
    // Development mode - just log
    if (process.env.NODE_ENV !== 'production' || !process.env.SMS_ENABLED) {
      logger.info(`📱 [SMS Mock] To: ${to}`);
      logger.info(`   Message: ${message}`);
      return { success: true, mock: true };
    }

    let result;
    
    switch (SMS_PROVIDER.toLowerCase()) {
      case 'twilio':
        result = await sendViaTwilio(to, message);
        break;
      
      case 'msg91':
        result = await sendViaMSG91(to, message);
        break;
      
      case 'textlocal':
        result = await sendViaTextLocal(to, message);
        break;
      
      default:
        throw new Error(`Unknown SMS provider: ${SMS_PROVIDER}`);
    }

    logger.info(`✅ SMS sent to ${to} via ${SMS_PROVIDER}`);
    return { success: true, data: result };
    
  } catch (error) {
    logger.error(`❌ SMS failed to ${to}:`, error.message);
    return { success: false, error: error.message };
  }
};

/**
 * Send OTP via SMS
 */
const sendOTP = async (phone, otp, purpose = 'verification') => {
  const message = `Your BLACKONN OTP for ${purpose} is: ${otp}. Valid for 10 minutes. Do not share with anyone.`;
  return sendSMS(phone, message);
};

/**
 * Send order confirmation SMS
 */
const sendOrderConfirmationSMS = async (phone, order) => {
  const message = `BLACKONN: Your order #${order.id.slice(-8)} of Rs.${order.total} is confirmed! We'll send shipping updates soon. Track: https://blackonn.com/track/${order.id}`;
  return sendSMS(phone, message);
};

/**
 * Send order shipped SMS
 */
const sendOrderShippedSMS = async (phone, order, trackingNumber) => {
  const message = `BLACKONN: Your order #${order.id.slice(-8)} has been shipped! ${trackingNumber ? `Tracking: ${trackingNumber}` : ''} Expected delivery: 3-5 days.`;
  return sendSMS(phone, message);
};

/**
 * Send order delivered SMS
 */
const sendOrderDeliveredSMS = async (phone, order) => {
  const message = `BLACKONN: Your order #${order.id.slice(-8)} has been delivered! Thank you for shopping with us. Rate your experience: https://blackonn.com/review/${order.id}`;
  return sendSMS(phone, message);
};

/**
 * Send payment reminder SMS
 */
const sendPaymentReminderSMS = async (phone, order) => {
  const message = `BLACKONN: Payment pending for order #${order.id.slice(-8)} (Rs.${order.total}). Complete now: https://blackonn.com/payment/${order.id}`;
  return sendSMS(phone, message);
};

/**
 * Send order cancelled SMS
 */
const sendOrderCancelledSMS = async (phone, order) => {
  const message = `BLACKONN: Your order #${order.id.slice(-8)} has been cancelled. ${order.paymentMethod !== 'COD' ? 'Refund will be processed in 5-7 days.' : ''} Questions? Contact support.`;
  return sendSMS(phone, message);
};

/**
 * Send return approved SMS
 */
const sendReturnApprovedSMS = async (phone, returnRequest) => {
  const message = `BLACKONN: Return approved for order #${returnRequest.orderId.slice(-8)}. Pickup scheduled. Refund in 5-7 days after item receipt.`;
  return sendSMS(phone, message);
};

/**
 * Send promotional SMS
 */
const sendPromotionalSMS = async (phone, offer) => {
  const message = `BLACKONN: ${offer.title}! ${offer.description} Use code: ${offer.couponCode}. Valid till ${new Date(offer.validTill).toLocaleDateString()}. Shop: https://blackonn.com`;
  return sendSMS(phone, message);
};

/**
 * Send welcome SMS to new user
 */
const sendWelcomeSMS = async (phone, userName) => {
  const message = `Welcome to BLACKONN, ${userName}! Get 10% off on your first order. Use code: WELCOME10. Happy shopping!`;
  return sendSMS(phone, message);
};

/**
 * Send abandoned cart reminder SMS
 */
const sendAbandonedCartSMS = async (phone, cart, userName) => {
  const total = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const message = `Hi ${userName}, you left items worth Rs.${total} in your cart! Complete checkout: https://blackonn.com/cart`;
  return sendSMS(phone, message);
};

/**
 * Send back in stock SMS
 */
const sendBackInStockSMS = async (phone, product) => {
  const message = `BLACKONN: ${product.name} is back in stock! Price: Rs.${product.price}. Limited stock! Buy now: https://blackonn.com/products/${product.id}`;
  return sendSMS(phone, message);
};

/**
 * Send price drop alert SMS
 */
const sendPriceDropSMS = async (phone, product, oldPrice) => {
  const discount = Math.round(((oldPrice - product.price) / oldPrice) * 100);
  const message = `BLACKONN: Price Drop! ${product.name} now Rs.${product.price} (${discount}% off). Limited time! https://blackonn.com/products/${product.id}`;
  return sendSMS(phone, message);
};

/**
 * Send admin notification SMS
 */
const sendAdminNotificationSMS = async (message) => {
  const results = [];
  
  for (const adminPhone of ADMIN_PHONE_NUMBERS) {
    const result = await sendSMS(adminPhone, `ADMIN ALERT: ${message}`);
    results.push({ phone: adminPhone, ...result });
  }
  
  return results;
};

/**
 * Send new order alert to admin
 */
const notifyAdminNewOrderSMS = async (order) => {
  const message = `New order #${order.id.slice(-8)} from ${order.shippingInfo.name}. Amount: Rs.${order.total}. Payment: ${order.paymentMethod}`;
  return sendAdminNotificationSMS(message);
};

/**
 * Send low stock alert to admin
 */
const notifyAdminLowStockSMS = async (product) => {
  const message = `Low Stock Alert: ${product.name} (Stock: ${product.stock}). Restock needed!`;
  return sendAdminNotificationSMS(message);
};

/**
 * Send return request to admin
 */
const notifyAdminReturnSMS = async (returnRequest) => {
  const message = `New return request for order #${returnRequest.orderId.slice(-8)}. Reason: ${returnRequest.reason}`;
  return sendAdminNotificationSMS(message);
};

/**
 * Send bulk SMS to multiple recipients
 */
const sendBulkSMS = async (phoneNumbers, message, delay = 1000) => {
  const results = [];
  
  for (let i = 0; i < phoneNumbers.length; i++) {
    const result = await sendSMS(phoneNumbers[i], message);
    results.push({ phone: phoneNumbers[i], ...result });
    
    // Add delay to avoid rate limiting
    if (i < phoneNumbers.length - 1) {
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  return results;
};

/**
 * Send scheduled SMS (for future implementation with job queue)
 */
const scheduleSMS = async (phone, message, scheduleTime) => {
  // This would integrate with a job queue like Bull or Agenda
  logger.info(`SMS scheduled for ${phone} at ${scheduleTime}`);
  return {
    success: true,
    scheduled: true,
    scheduleTime,
    phone,
    message
  };
};

module.exports = {
  // Core
  sendSMS,
  sendBulkSMS,
  scheduleSMS,
  
  // User notifications
  sendOTP,
  sendOrderConfirmationSMS,
  sendOrderShippedSMS,
  sendOrderDeliveredSMS,
  sendOrderCancelledSMS,
  sendPaymentReminderSMS,
  sendReturnApprovedSMS,
  sendPromotionalSMS,
  sendWelcomeSMS,
  sendAbandonedCartSMS,
  sendBackInStockSMS,
  sendPriceDropSMS,
  
  // Admin notifications
  sendAdminNotificationSMS,
  notifyAdminNewOrderSMS,
  notifyAdminLowStockSMS,
  notifyAdminReturnSMS
};
