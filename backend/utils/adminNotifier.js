const { sendEmail } = require('./email');
const { sendAdminNotification: sendWhatsApp } = require('./whatsapp');
const { sendAdminNotificationSMS: sendSMS } = require('./sms');
const logger = require('./logger');

// Python AI Bridge for intelligent alert prioritization
let pythonBridge = null;
try {
  pythonBridge = require('./python_bridge');
} catch (e) {
  console.warn('[AdminNotifier] Python bridge not available');
}

/**
 * Unified Admin Notification System
 * Sends alerts to admins via multiple channels based on configuration
 */

const ADMIN_EMAILS = process.env.ADMIN_EMAIL ? 
  process.env.ADMIN_EMAIL.split(',') : 
  [];

/**
 * Notify all admins about a critical event
 * @param {string} subject 
 * @param {string} message 
 * @param {Object} data 
 */
const notifyAdmins = async (subject, message, data = {}) => {
  const results = { email: [], whatsapp: [], sms: [], aiAnalysis: null };
  
  logger.info(`🔔 [Admin Notifier] Sending alert: ${subject}`);
  
  // AI-powered alert analysis and prioritization
  if (pythonBridge) {
    try {
      results.aiAnalysis = await pythonBridge.security.analyzeRequest({
        alertType: subject,
        message,
        timestamp: new Date().toISOString(),
        ...data
      });
      if (results.aiAnalysis && results.aiAnalysis.severity === 'critical') {
        logger.warn(`🚨 [AI] Critical alert detected: ${subject}`);
      }
    } catch (e) {
      // AI unavailable, continue with standard alert
    }
  }

  // 1. Email Notifications
  if (ADMIN_EMAILS.length > 0) {
    for (const email of ADMIN_EMAILS) {
      const emailResult = await sendEmail({
        to: email,
        subject: `[ADMIN ALERT] ${subject}`,
        text: message,
        html: `<div style="font-family: sans-serif; padding: 20px; border: 1px solid #eee;">
                <h2 style="color: #dc2626;">🚨 Admin Alert</h2>
                <p><strong>Event:</strong> ${subject}</p>
                <p>${message}</p>
                <hr/>
                <p style="font-size: 12px; color: #666;">Time: ${new Date().toLocaleString()}</p>
               </div>`
      });
      results.email.push({ email, success: !!emailResult });
    }
  }

  // 2. WhatsApp Notifications
  try {
    const waResult = await sendWhatsApp(message);
    results.whatsapp.push(...waResult);
  } catch (err) {
    logger.error('Failed to send Admin WhatsApp:', err.message);
  }

  // 3. SMS Notifications
  try {
    const smsResult = await sendSMS(message);
    results.sms.push(...smsResult);
  } catch (err) {
    logger.error('Failed to send Admin SMS:', err.message);
  }

  return results;
};

module.exports = { notifyAdmins };
