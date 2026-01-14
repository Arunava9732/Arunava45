/**
 * Unified Notification Service for BLACKONN
 * Combines Email, SMS, and WhatsApp notifications
 */

const email = require('./email');
const sms = require('./sms');
const whatsapp = require('./whatsapp');
const logger = require('./logger');

// Python AI Bridge for intelligent notification routing
let pythonBridge = null;
try {
  pythonBridge = require('./python_bridge');
} catch (e) {
  console.warn('[Notifications] Python bridge not available');
}

// Notification preferences
const NOTIFICATION_CHANNELS = {
  EMAIL: 'email',
  SMS: 'sms',
  WHATSAPP: 'whatsapp'
};

// Default notification settings
const DEFAULT_SETTINGS = {
  orderConfirmation: ['email', 'whatsapp'],
  orderShipped: ['email', 'sms', 'whatsapp'],
  orderDelivered: ['email', 'whatsapp'],
  paymentReceived: ['email'],
  orderCancelled: ['email', 'sms'],
  returnApproved: ['email', 'whatsapp'],
  promotional: ['email'],
  adminAlert: ['email', 'whatsapp']
};

/**
 * Send notification through multiple channels with AI optimization
 */
const sendNotification = async (type, recipient, data, channels = null) => {
  let selectedChannels = channels || DEFAULT_SETTINGS[type] || ['email'];
  const results = {};
  
  // AI-powered channel optimization
  if (pythonBridge && !channels) {
    try {
      const aiRecommendation = await pythonBridge.emotion.detectIntent({ type, recipient, context: data });
      if (aiRecommendation && aiRecommendation.preferredChannels) {
        selectedChannels = aiRecommendation.preferredChannels;
        results.aiOptimized = true;
      }
    } catch (e) {
      // Fallback to defaults
    }
  }

  logger.info(`📢 Sending ${type} notification to ${recipient.email || recipient.phone}`);

  // Send through each channel
  for (const channel of selectedChannels) {
    try {
      switch (channel) {
        case NOTIFICATION_CHANNELS.EMAIL:
          if (recipient.email) {
            results.email = await sendEmailNotification(type, recipient, data);
          }
          break;

        case NOTIFICATION_CHANNELS.SMS:
          if (recipient.phone) {
            results.sms = await sendSMSNotification(type, recipient, data);
          }
          break;

        case NOTIFICATION_CHANNELS.WHATSAPP:
          if (recipient.phone) {
            results.whatsapp = await sendWhatsAppNotification(type, recipient, data);
          }
          break;

        default:
          logger.warn(`Unknown notification channel: ${channel}`);
      }
    } catch (error) {
      logger.error(`Failed to send ${type} via ${channel}:`, error.message);
      results[channel] = { success: false, error: error.message };
    }
  }

  return results;
};

/**
 * Send email notification based on type
 */
const sendEmailNotification = async (type, recipient, data) => {
  switch (type) {
    case 'orderConfirmation':
      return email.sendOrderConfirmation(data.order, recipient.email);
    
    case 'orderShipped':
      return email.sendOrderShippedEmail(data.order, data.trackingInfo);
    
    case 'orderDelivered':
      return email.sendOrderDeliveredEmail(data.order);
    
    case 'orderCancelled':
      return email.sendOrderCancelledEmail(data.order, data.reason);
    
    case 'paymentReceived':
      return email.sendPaymentConfirmation(data.order, data.paymentDetails);
    
    case 'returnApproved':
      return email.sendReturnApprovedEmail(data.returnRequest, data.order);
    
    case 'promotional':
      return email.sendPromotionalEmail(recipient, data.promotion);
    
    case 'welcome':
      return email.sendWelcomeEmail(recipient);
    
    case 'passwordReset':
      return email.sendPasswordResetOTP(recipient.email, data.otp);
    
    case 'abandonedCart':
      return email.sendAbandonedCartReminder(recipient, data.cart);
    
    case 'accountVerification':
      return email.sendAccountVerification(recipient, data.token);
    
    default:
      logger.warn(`Unknown email notification type: ${type}`);
      return null;
  }
};

/**
 * Send SMS notification based on type
 */
const sendSMSNotification = async (type, recipient, data) => {
  switch (type) {
    case 'orderConfirmation':
      return sms.sendOrderConfirmationSMS(recipient.phone, data.order);
    
    case 'orderShipped':
      return sms.sendOrderShippedSMS(recipient.phone, data.order, data.trackingInfo?.trackingNumber);
    
    case 'orderDelivered':
      return sms.sendOrderDeliveredSMS(recipient.phone, data.order);
    
    case 'orderCancelled':
      return sms.sendOrderCancelledSMS(recipient.phone, data.order);
    
    case 'paymentReminder':
      return sms.sendPaymentReminderSMS(recipient.phone, data.order);
    
    case 'returnApproved':
      return sms.sendReturnApprovedSMS(recipient.phone, data.returnRequest);
    
    case 'promotional':
      return sms.sendPromotionalSMS(recipient.phone, data.offer);
    
    case 'welcome':
      return sms.sendWelcomeSMS(recipient.phone, recipient.name);
    
    case 'otp':
      return sms.sendOTP(recipient.phone, data.otp, data.purpose);
    
    case 'abandonedCart':
      return sms.sendAbandonedCartSMS(recipient.phone, data.cart, recipient.name);
    
    case 'priceDropAlert':
      return sms.sendPriceDropSMS(recipient.phone, data.product, data.oldPrice);
    
    case 'backInStock':
      return sms.sendBackInStockSMS(recipient.phone, data.product);
    
    default:
      logger.warn(`Unknown SMS notification type: ${type}`);
      return null;
  }
};

/**
 * Send WhatsApp notification based on type
 */
const sendWhatsAppNotification = async (type, recipient, data) => {
  switch (type) {
    case 'orderConfirmation':
      return whatsapp.sendOrderConfirmationWithButtons(recipient.phone, data.order);
    
    case 'orderShipped':
      return whatsapp.sendOrderShipped(recipient.phone, data.order, data.trackingInfo?.trackingUrl);
    
    case 'orderDelivered':
      return whatsapp.sendOrderDelivered(recipient.phone, data.order);
    
    case 'paymentReminder':
      return whatsapp.sendPaymentReminder(recipient.phone, data.order);
    
    case 'returnApproved':
      return whatsapp.sendReturnStatusUpdate(recipient.phone, data.returnRequest);
    
    case 'promotional':
      return whatsapp.sendPromotionalOffer(recipient.phone, data.offer);
    
    case 'welcome':
      return whatsapp.sendWelcomeMessage(recipient.phone, recipient.name);
    
    case 'otp':
      return whatsapp.sendOTP(recipient.phone, data.otp, data.purpose);
    
    case 'abandonedCart':
      return whatsapp.sendAbandonedCartReminder(recipient.phone, data.cart, recipient.name);
    
    case 'priceDropAlert':
      return whatsapp.sendPriceDropAlert(recipient.phone, data.product, data.oldPrice);
    
    case 'backInStock':
      return whatsapp.sendBackInStock(recipient.phone, data.product);
    
    default:
      logger.warn(`Unknown WhatsApp notification type: ${type}`);
      return null;
  }
};

/**
 * Send admin notifications
 */
const notifyAdmin = async (type, data, channels = ['email', 'whatsapp']) => {
  const results = {};

  for (const channel of channels) {
    try {
      switch (type) {
        case 'newOrder':
          if (channel === 'email') {
            results.email = await email.sendNewOrderAdmin(data.order);
          } else if (channel === 'whatsapp') {
            results.whatsapp = await whatsapp.notifyAdminNewOrder(data.order);
          } else if (channel === 'sms') {
            results.sms = await sms.notifyAdminNewOrderSMS(data.order);
          }
          break;

        case 'lowStock':
          if (channel === 'email') {
            results.email = await email.sendLowStockAlert(data.product);
          } else if (channel === 'whatsapp') {
            results.whatsapp = await whatsapp.notifyAdminLowStock(data.product);
          } else if (channel === 'sms') {
            results.sms = await sms.notifyAdminLowStockSMS(data.product);
          }
          break;

        case 'newReturn':
          if (channel === 'email') {
            // Email function would need to be added
            results.email = { success: true, note: 'No email template yet' };
          } else if (channel === 'whatsapp') {
            results.whatsapp = await whatsapp.notifyAdminReturn(data.returnRequest);
          } else if (channel === 'sms') {
            results.sms = await sms.notifyAdminReturnSMS(data.returnRequest);
          }
          break;

        case 'contactForm':
          if (channel === 'email') {
            results.email = await email.sendContactNotification(data.contact);
          } else if (channel === 'whatsapp') {
            results.whatsapp = await whatsapp.notifyAdminContact(data.contact);
          }
          break;

        case 'criticalAlert':
          if (channel === 'whatsapp') {
            results.whatsapp = await whatsapp.sendCriticalAlert(data.alertType, data.details);
          } else if (channel === 'sms') {
            results.sms = await sms.sendAdminNotificationSMS(`CRITICAL: ${data.alertType} - ${data.details}`);
          }
          break;

        default:
          logger.warn(`Unknown admin notification type: ${type}`);
      }
    } catch (error) {
      logger.error(`Failed to send admin ${type} via ${channel}:`, error.message);
      results[channel] = { success: false, error: error.message };
    }
  }

  return results;
};

/**
 * Send bulk notifications
 */
const sendBulkNotifications = async (recipients, type, data, channels = ['email']) => {
  const results = [];

  for (const recipient of recipients) {
    const result = await sendNotification(type, recipient, data, channels);
    results.push({
      recipient: recipient.email || recipient.phone,
      ...result
    });

    // Add small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  return results;
};

/**
 * Quick notification shortcuts
 */
const notifications = {
  // User notifications
  orderConfirmed: (user, order) => 
    sendNotification('orderConfirmation', user, { order }),
  
  orderShipped: (user, order, trackingInfo) => 
    sendNotification('orderShipped', user, { order, trackingInfo }),
  
  orderDelivered: (user, order) => 
    sendNotification('orderDelivered', user, { order }),
  
  orderCancelled: (user, order, reason) => 
    sendNotification('orderCancelled', user, { order, reason }),
  
  paymentReceived: (user, order, paymentDetails) => 
    sendNotification('paymentReceived', user, { order, paymentDetails }, ['email']),
  
  returnApproved: (user, returnRequest, order) => 
    sendNotification('returnApproved', user, { returnRequest, order }),
  
  sendOTP: (user, otp, purpose) => 
    sendNotification('otp', user, { otp, purpose }, ['sms', 'whatsapp']),
  
  welcomeUser: (user) => 
    sendNotification('welcome', user, {}, ['email', 'sms']),
  
  abandonedCart: (user, cart) => 
    sendNotification('abandonedCart', user, { cart }, ['email', 'whatsapp']),
  
  priceDropAlert: (user, product, oldPrice) => 
    sendNotification('priceDropAlert', user, { product, oldPrice }, ['sms', 'whatsapp']),
  
  backInStock: (user, product) => 
    sendNotification('backInStock', user, { product }, ['sms', 'whatsapp']),
  
  // Admin notifications
  newOrder: (order) => 
    notifyAdmin('newOrder', { order }),
  
  lowStockAlert: (product) => 
    notifyAdmin('lowStock', { product }),
  
  newReturnRequest: (returnRequest) => 
    notifyAdmin('newReturn', { returnRequest }),
  
  contactFormSubmitted: (contact) => 
    notifyAdmin('contactForm', { contact }),
  
  criticalAlert: (alertType, details) => 
    notifyAdmin('criticalAlert', { alertType, details }, ['whatsapp', 'sms', 'email'])
};

module.exports = {
  sendNotification,
  notifyAdmin,
  sendBulkNotifications,
  notifications,
  NOTIFICATION_CHANNELS,
  DEFAULT_SETTINGS
};
