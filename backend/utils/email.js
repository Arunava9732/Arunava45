/**
 * Email Utility for BLACKONN - Advanced Multi-Purpose Messaging
 * Handles sending emails via SMTP with comprehensive templates
 */

const nodemailer = require('nodemailer');
const logger = require('./logger');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// Email Templates Configuration
const EMAIL_TEMPLATES = {
  ORDER_CONFIRMATION: 'order_confirmation',
  ORDER_SHIPPED: 'order_shipped',
  ORDER_DELIVERED: 'order_delivered',
  ORDER_CANCELLED: 'order_cancelled',
  PAYMENT_RECEIVED: 'payment_received',
  PASSWORD_RESET: 'password_reset',
  WELCOME: 'welcome',
  ACCOUNT_VERIFICATION: 'account_verification',
  ABANDONED_CART: 'abandoned_cart',
  PROMOTIONAL: 'promotional',
  NEWSLETTER: 'newsletter',
  RETURN_APPROVED: 'return_approved',
  REFUND_PROCESSED: 'refund_processed',
  LOW_STOCK_ADMIN: 'low_stock_admin',
  CONTACT_ADMIN: 'contact_admin',
  NEW_ORDER_ADMIN: 'new_order_admin'
};

// AI Email Tracker
function aiEmailLog(event, details = {}) {
  logger.info('[AI-EMAIL]', {
    timestamp: new Date().toISOString(),
    event,
    ...details,
    _structured: true
  });
}

// Create transporter using environment variables
const createTransporter = () => {
  // Default to a "no-op" transporter if no credentials provided
  if (!process.env.EMAIL_HOST || !process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    if (process.env.NODE_ENV === 'production') {
      logger.warn('Email credentials missing in production. Emails will not be sent.');
    }
    return {
      sendMail: async (options) => {
        logger.info(`[Email Simulation] To: ${options.to}, Subject: ${options.subject}`);
        return { messageId: 'simulated-' + Date.now() };
      }
    };
  }

  return nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: process.env.EMAIL_PORT || 587,
    secure: process.env.EMAIL_SECURE === 'true', // true for 465, false for other ports
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
    tls: {
      rejectUnauthorized: process.env.NODE_ENV === 'production'
    }
  });
};

/**
 * Send an email
 * @param {Object} options - Email options (to, subject, text, html)
 */
const sendEmail = async (options) => {
  const emailId = crypto.randomBytes(8).toString('hex');
  
  try {
    aiEmailLog('SENDING', { emailId, to: options.to, subject: options.subject });
    
    const transporter = createTransporter();
    
    const mailOptions = {
      from: `"${process.env.EMAIL_FROM_NAME || 'BLACKONN'}" <${process.env.EMAIL_FROM_ADDRESS || process.env.EMAIL_USER}>`,
      to: options.to,
      subject: options.subject,
      text: options.text,
      html: options.html,
      attachments: options.attachments || []
    };

    const info = await transporter.sendMail(mailOptions);
    logger.info(`Email sent: ${info.messageId}`);
    aiEmailLog('SENT', { emailId, messageId: info.messageId, to: options.to });
    return info;
  } catch (error) {
    logger.error(`Email failed to send: ${error.message}`);
    aiEmailLog('FAILED', { emailId, error: error.message, to: options.to });
    // Don't throw error to prevent breaking the main flow, just log it
    return null;
  }
};

/**
 * Send Order Confirmation Email
 */
const sendOrderConfirmation = async (order, userEmail) => {
  const subject = `Order Confirmation - #${order.id.slice(-8).toUpperCase()}`;
  
  const itemsHtml = order.items.map(item => `
    <tr>
      <td style="padding: 10px; border-bottom: 1px solid #eee;">${item.name} x ${item.quantity}</td>
      <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right;">₹${item.price * item.quantity}</td>
    </tr>
  `).join('');

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #eee; padding: 20px;">
      <div style="text-align: center; margin-bottom: 20px;">
        <h1 style="color: #000; margin: 0;">BLACKONN</h1>
        <p style="color: #666;">Thank you for your order!</p>
      </div>
      
      <div style="margin-bottom: 20px;">
        <h3>Order Details</h3>
        <p><strong>Order ID:</strong> #${order.id.toUpperCase()}</p>
        <p><strong>Date:</strong> ${new Date(order.createdAt).toLocaleDateString()}</p>
      </div>
      
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
        <thead>
          <tr style="background: #f9f9f9;">
            <th style="padding: 10px; text-align: left;">Item</th>
            <th style="padding: 10px; text-align: right;">Price</th>
          </tr>
        </thead>
        <tbody>
          ${itemsHtml}
        </tbody>
        <tfoot>
          <tr>
            <td style="padding: 10px; font-weight: bold;">Total</td>
            <td style="padding: 10px; font-weight: bold; text-align: right;">₹${order.total}</td>
          </tr>
        </tfoot>
      </table>
      
      <div style="margin-bottom: 20px;">
        <h3>Shipping Address</h3>
        <p>${order.shippingInfo.name}<br>
        ${order.shippingInfo.address}<br>
        ${order.shippingInfo.city}, ${order.shippingInfo.state} - ${order.shippingInfo.pincode}<br>
        Phone: ${order.shippingInfo.phone}</p>
      </div>
      
      <div style="text-align: center; color: #999; font-size: 12px; margin-top: 30px;">
        <p>&copy; ${new Date().getFullYear()} BLACKONN. All rights reserved.</p>
        <p>Kolkata, West Bengal, India</p>
      </div>
    </div>
  `;

  return sendEmail({
    to: userEmail,
    subject,
    html,
    text: `Thank you for your order #${order.id.toUpperCase()}. Total: ₹${order.total}`
  });
};

/**
 * Send Password Reset OTP Email
 */
const sendPasswordResetOTP = async (email, otp) => {
  const subject = 'Password Reset OTP - BLACKONN';
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #eee; padding: 20px;">
      <div style="text-align: center; margin-bottom: 20px;">
        <h1 style="color: #000; margin: 0;">BLACKONN</h1>
      </div>
      
      <p>Hello,</p>
      <p>You requested a password reset for your BLACKONN account. Use the following OTP to reset your password:</p>
      
      <div style="text-align: center; margin: 30px 0;">
        <h2 style="background: #f4f4f4; padding: 15px; display: inline-block; letter-spacing: 5px; border-radius: 5px;">${otp}</h2>
      </div>
      
      <p>This OTP is valid for 30 minutes. If you did not request this, please ignore this email.</p>
      
      <div style="text-align: center; color: #999; font-size: 12px; margin-top: 30px;">
        <p>&copy; ${new Date().getFullYear()} BLACKONN. All rights reserved.</p>
      </div>
    </div>
  `;

  return sendEmail({
    to: email,
    subject,
    html,
    text: `Your password reset OTP is: ${otp}`
  });
};

/**
 * Send Low Stock Alert to Admin
 */
const sendLowStockAlert = async (product) => {
  const adminEmail = process.env.ADMIN_EMAIL || process.env.EMAIL_USER;
  if (!adminEmail) return;

  const subject = `⚠️ Low Stock Alert: ${product.name}`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #eee; padding: 20px;">
      <h2 style="color: #d9534f;">Low Stock Alert</h2>
      <p>The following product is running low on stock:</p>
      <div style="background: #f9f9f9; padding: 15px; border-left: 4px solid #d9534f;">
        <p><strong>Product:</strong> ${product.name}</p>
        <p><strong>SKU:</strong> ${product.sku || 'N/A'}</p>
        <p><strong>Current Stock:</strong> <span style="color: #d9534f; font-weight: bold;">${product.stock}</span></p>
      </div>
      <p style="margin-top: 20px;">Please restock this item soon to avoid running out.</p>
      <div style="text-align: center; margin-top: 30px;">
        <a href="${process.env.FRONTEND_URL || 'https://blackonn.com'}/admin.html#products" style="background: #000; color: #fff; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Manage Inventory</a>
      </div>
    </div>
  `;

  return sendEmail({
    to: adminEmail,
    subject,
    html,
    text: `Low Stock Alert: ${product.name} is down to ${product.stock} units.`
  });
};

/**
 * Send Abandoned Cart Reminder
 */
const sendAbandonedCartReminder = async (user, cart) => {
  const subject = 'You left something in your cart! - BLACKONN';
  
  const itemsHtml = cart.map(item => `
    <div style="display: flex; align-items: center; margin-bottom: 15px; border-bottom: 1px solid #eee; padding-bottom: 10px;">
      <div style="flex: 1;">
        <p style="margin: 0; font-weight: bold;">${item.name}</p>
        <p style="margin: 0; color: #666; font-size: 14px;">Qty: ${item.quantity} | Price: ₹${item.price}</p>
      </div>
    </div>
  `).join('');

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #eee; padding: 20px;">
      <div style="text-align: center; margin-bottom: 20px;">
        <h1 style="color: #000; margin: 0;">BLACKONN</h1>
      </div>
      
      <p>Hi ${user.name},</p>
      <p>We noticed you left some items in your cart. They are still waiting for you!</p>
      
      <div style="margin: 30px 0;">
        ${itemsHtml}
      </div>
      
      <div style="text-align: center; margin-top: 30px;">
        <a href="${process.env.FRONTEND_URL || 'https://blackonn.com'}/cart.html" style="background: #000; color: #fff; padding: 15px 30px; text-decoration: none; border-radius: 5px; font-weight: bold;">Complete Your Purchase</a>
      </div>
      
      <p style="margin-top: 30px; font-size: 12px; color: #999; text-align: center;">
        If you have any questions, just reply to this email. We're here to help!
      </p>
    </div>
  `;

  return sendEmail({
    to: user.email,
    subject,
    html,
    text: `Hi ${user.name}, you left items in your cart at BLACKONN. Come back and finish your order!`
  });
};

/**
 * Send Contact Form Notification to Admin
 */
const sendContactNotification = async (contactData) => {
  const adminEmail = process.env.ADMIN_EMAIL || process.env.EMAIL_USER;
  if (!adminEmail) return;

  const subject = `New Contact Inquiry: ${contactData.queryNumber}`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #eee; padding: 20px;">
      <h3>New Contact Form Submission</h3>
      <p><strong>Query Number:</strong> ${contactData.queryNumber}</p>
      <p><strong>Name:</strong> ${contactData.name}</p>
      <p><strong>Email:</strong> ${contactData.email}</p>
      <p><strong>Subject:</strong> ${contactData.subject}</p>
      <p><strong>Message:</strong></p>
      <div style="background: #f9f9f9; padding: 15px; border-left: 4px solid #000;">
        ${contactData.message}
      </div>
    </div>
  `;

  return sendEmail({
    to: adminEmail,
    subject,
    html,
    text: `New contact inquiry from ${contactData.name} (${contactData.email}): ${contactData.message}`
  });
};

// ============ ADVANCED EMAIL TEMPLATES ============

/**
 * Send Welcome Email to New User
 */
const sendWelcomeEmail = async (user) => {
  const subject = 'Welcome to BLACKONN! 🎉';
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 2px;">
      <div style="background: white; padding: 40px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #000; margin: 0; font-size: 32px;">BLACKONN</h1>
          <p style="color: #667eea; font-size: 20px; margin: 10px 0;">Welcome Aboard! 🎉</p>
        </div>
        
        <p>Hi ${user.fullName || user.name},</p>
        <p>Thank you for joining <strong>BLACKONN</strong>! We're excited to have you as part of our community.</p>
        
        <div style="background: #f9f9f9; padding: 20px; border-radius: 10px; margin: 20px 0;">
          <h3 style="margin-top: 0;">🎁 Special Welcome Offer</h3>
          <p style="font-size: 24px; font-weight: bold; color: #667eea; margin: 10px 0;">Get 10% OFF</p>
          <p>on your first purchase!</p>
          <p style="background: #fff; padding: 10px; border: 2px dashed #667eea; display: inline-block; font-weight: bold;">
            Use code: WELCOME10
          </p>
        </div>
        
        <div style="margin: 30px 0;">
          <h3>What's Next?</h3>
          <ul style="line-height: 2;">
            <li>🛍️ Browse our latest collection</li>
            <li>💝 Create your wishlist</li>
            <li>🔔 Enable notifications for exclusive deals</li>
            <li>📱 Download our mobile app</li>
          </ul>
        </div>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="${process.env.FRONTEND_URL || 'https://blackonn.com'}/products.html" 
             style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: #fff; padding: 15px 40px; text-decoration: none; border-radius: 25px; font-weight: bold; display: inline-block;">
            Start Shopping
          </a>
        </div>
        
        <div style="border-top: 1px solid #eee; margin-top: 30px; padding-top: 20px; color: #999; font-size: 12px; text-align: center;">
          <p>Need help? Reply to this email or visit our <a href="${process.env.FRONTEND_URL || 'https://blackonn.com'}/contact.html">Help Center</a></p>
          <p>&copy; ${new Date().getFullYear()} BLACKONN. All rights reserved.</p>
        </div>
      </div>
    </div>
  `;

  return sendEmail({
    to: user.email,
    subject,
    html,
    text: `Welcome to BLACKONN, ${user.fullName}! Get 10% off your first order with code WELCOME10`
  });
};

/**
 * Send Order Shipped Email
 */
const sendOrderShippedEmail = async (order, trackingInfo) => {
  const subject = `Your Order is On Its Way! #${order.id.slice(-8).toUpperCase()}`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #eee; padding: 20px;">
      <div style="text-align: center; margin-bottom: 30px;">
        <h1 style="color: #000; margin: 0;">BLACKONN</h1>
        <div style="background: #4CAF50; color: white; padding: 15px; margin: 20px 0; border-radius: 5px;">
          <h2 style="margin: 0;">🚚 Order Shipped!</h2>
        </div>
      </div>
      
      <p>Hi ${order.shippingInfo.name},</p>
      <p>Great news! Your order has been shipped and is on its way to you.</p>
      
      <div style="background: #f9f9f9; padding: 20px; border-radius: 5px; margin: 20px 0;">
        <p style="margin: 5px 0;"><strong>Order ID:</strong> #${order.id.toUpperCase()}</p>
        <p style="margin: 5px 0;"><strong>Tracking Number:</strong> ${trackingInfo.trackingNumber || 'Will be updated soon'}</p>
        <p style="margin: 5px 0;"><strong>Carrier:</strong> ${trackingInfo.carrier || 'Standard Shipping'}</p>
        <p style="margin: 5px 0;"><strong>Expected Delivery:</strong> ${trackingInfo.estimatedDelivery || '3-5 business days'}</p>
      </div>
      
      ${trackingInfo.trackingUrl ? `
      <div style="text-align: center; margin: 30px 0;">
        <a href="${trackingInfo.trackingUrl}" 
           style="background: #000; color: #fff; padding: 12px 30px; text-decoration: none; border-radius: 5px; font-weight: bold;">
          Track Your Order
        </a>
      </div>
      ` : ''}
      
      <div style="margin-top: 30px; padding: 15px; background: #e3f2fd; border-left: 4px solid #2196F3; border-radius: 5px;">
        <p style="margin: 0;"><strong>📦 Delivery Instructions:</strong></p>
        <p style="margin: 5px 0;">Please ensure someone is available to receive the package. If you have specific delivery instructions, you can update them by replying to this email.</p>
      </div>
      
      <div style="text-align: center; color: #999; font-size: 12px; margin-top: 30px;">
        <p>&copy; ${new Date().getFullYear()} BLACKONN. All rights reserved.</p>
      </div>
    </div>
  `;

  return sendEmail({
    to: order.email || order.shippingInfo.email,
    subject,
    html,
    text: `Your order #${order.id} has been shipped! Track: ${trackingInfo.trackingUrl || 'Check your email for updates'}`
  });
};

/**
 * Send Order Delivered Email
 */
const sendOrderDeliveredEmail = async (order) => {
  const subject = `Order Delivered! #${order.id.slice(-8).toUpperCase()}`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #eee; padding: 20px;">
      <div style="text-align: center; margin-bottom: 30px;">
        <h1 style="color: #000; margin: 0;">BLACKONN</h1>
        <div style="background: #4CAF50; color: white; padding: 20px; margin: 20px 0; border-radius: 10px;">
          <h2 style="margin: 0;">✅ Delivered Successfully!</h2>
        </div>
      </div>
      
      <p>Hi ${order.shippingInfo.name},</p>
      <p>Your order has been delivered! We hope you love your purchase.</p>
      
      <div style="background: #f9f9f9; padding: 20px; border-radius: 5px; margin: 20px 0;">
        <p style="margin: 5px 0;"><strong>Order ID:</strong> #${order.id.toUpperCase()}</p>
        <p style="margin: 5px 0;"><strong>Delivered On:</strong> ${new Date().toLocaleDateString()}</p>
      </div>
      
      <div style="text-align: center; margin: 30px 0;">
        <p style="font-size: 18px; margin-bottom: 20px;">How was your experience?</p>
        <a href="${process.env.FRONTEND_URL || 'https://blackonn.com'}/review/${order.id}" 
           style="background: #FFB400; color: #000; padding: 12px 30px; text-decoration: none; border-radius: 25px; font-weight: bold; margin: 5px;">
          ⭐ Write a Review
        </a>
      </div>
      
      <div style="margin: 30px 0; padding: 15px; background: #fff3cd; border-left: 4px solid #FFB400; border-radius: 5px;">
        <p style="margin: 0;"><strong>Need to return?</strong></p>
        <p style="margin: 5px 0;">You have 7 days to initiate a return. Visit our <a href="${process.env.FRONTEND_URL || 'https://blackonn.com'}/return-policy.html">Return Policy</a> for details.</p>
      </div>
      
      <div style="text-align: center; color: #999; font-size: 12px; margin-top: 30px;">
        <p>Thank you for shopping with BLACKONN!</p>
        <p>&copy; ${new Date().getFullYear()} BLACKONN. All rights reserved.</p>
      </div>
    </div>
  `;

  return sendEmail({
    to: order.email || order.shippingInfo.email,
    subject,
    html,
    text: `Your order #${order.id} has been delivered! Please rate your experience.`
  });
};

/**
 * Send Payment Confirmation Email
 */
const sendPaymentConfirmation = async (order, paymentDetails) => {
  const subject = `Payment Received - Order #${order.id.slice(-8).toUpperCase()}`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #eee; padding: 20px;">
      <div style="text-align: center; margin-bottom: 30px;">
        <h1 style="color: #000; margin: 0;">BLACKONN</h1>
        <div style="background: #4CAF50; color: white; padding: 15px; margin: 20px 0; border-radius: 5px;">
          <h2 style="margin: 0;">💳 Payment Successful</h2>
        </div>
      </div>
      
      <p>Hi ${order.shippingInfo.name},</p>
      <p>We have received your payment for order <strong>#${order.id.toUpperCase()}</strong></p>
      
      <div style="background: #f9f9f9; padding: 20px; border-radius: 5px; margin: 20px 0;">
        <h3 style="margin-top: 0;">Payment Details</h3>
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>Amount Paid:</strong></td>
            <td style="padding: 8px 0; border-bottom: 1px solid #eee; text-align: right;">₹${order.total}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>Payment Method:</strong></td>
            <td style="padding: 8px 0; border-bottom: 1px solid #eee; text-align: right;">${paymentDetails.method || order.paymentMethod}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>Transaction ID:</strong></td>
            <td style="padding: 8px 0; border-bottom: 1px solid #eee; text-align: right;">${paymentDetails.transactionId || 'N/A'}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0;"><strong>Date:</strong></td>
            <td style="padding: 8px 0; text-align: right;">${new Date().toLocaleDateString()}</td>
          </tr>
        </table>
      </div>
      
      <p>Your order is being processed and will be shipped soon. You'll receive a shipping confirmation once it's on its way.</p>
      
      <div style="text-align: center; color: #999; font-size: 12px; margin-top: 30px;">
        <p>&copy; ${new Date().getFullYear()} BLACKONN. All rights reserved.</p>
      </div>
    </div>
  `;

  return sendEmail({
    to: order.email || order.shippingInfo.email,
    subject,
    html,
    text: `Payment of ₹${order.total} received for order #${order.id}`
  });
};

/**
 * Send Order Cancelled Email
 */
const sendOrderCancelledEmail = async (order, reason) => {
  const subject = `Order Cancelled - #${order.id.slice(-8).toUpperCase()}`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #eee; padding: 20px;">
      <div style="text-align: center; margin-bottom: 30px;">
        <h1 style="color: #000; margin: 0;">BLACKONN</h1>
        <div style="background: #f44336; color: white; padding: 15px; margin: 20px 0; border-radius: 5px;">
          <h2 style="margin: 0;">Order Cancelled</h2>
        </div>
      </div>
      
      <p>Hi ${order.shippingInfo.name},</p>
      <p>Your order <strong>#${order.id.toUpperCase()}</strong> has been cancelled.</p>
      
      ${reason ? `
      <div style="background: #fff3cd; padding: 15px; border-left: 4px solid #FFB400; margin: 20px 0;">
        <p style="margin: 0;"><strong>Reason:</strong> ${reason}</p>
      </div>
      ` : ''}
      
      ${order.paymentMethod !== 'COD' ? `
      <div style="background: #e3f2fd; padding: 15px; border-left: 4px solid #2196F3; margin: 20px 0;">
        <p style="margin: 0;"><strong>Refund Information:</strong></p>
        <p style="margin: 5px 0;">Your refund of ₹${order.total} will be processed within 5-7 business days to your original payment method.</p>
      </div>
      ` : ''}
      
      <div style="text-align: center; margin: 30px 0;">
        <a href="${process.env.FRONTEND_URL || 'https://blackonn.com'}/products.html" 
           style="background: #000; color: #fff; padding: 12px 30px; text-decoration: none; border-radius: 5px; font-weight: bold;">
          Continue Shopping
        </a>
      </div>
      
      <div style="text-align: center; color: #999; font-size: 12px; margin-top: 30px;">
        <p>If you have any questions, please contact our support team.</p>
        <p>&copy; ${new Date().getFullYear()} BLACKONN. All rights reserved.</p>
      </div>
    </div>
  `;

  return sendEmail({
    to: order.email || order.shippingInfo.email,
    subject,
    html,
    text: `Your order #${order.id} has been cancelled. ${order.paymentMethod !== 'COD' ? 'Refund will be processed in 5-7 days.' : ''}`
  });
};

/**
 * Send Return/Refund Approved Email
 */
const sendReturnApprovedEmail = async (returnRequest, order) => {
  const subject = `Return Approved - Order #${returnRequest.orderId.slice(-8).toUpperCase()}`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #eee; padding: 20px;">
      <div style="text-align: center; margin-bottom: 30px;">
        <h1 style="color: #000; margin: 0;">BLACKONN</h1>
        <div style="background: #4CAF50; color: white; padding: 15px; margin: 20px 0; border-radius: 5px;">
          <h2 style="margin: 0;">✅ Return Approved</h2>
        </div>
      </div>
      
      <p>Hi ${order.shippingInfo.name},</p>
      <p>Your return request for order <strong>#${returnRequest.orderId.toUpperCase()}</strong> has been approved.</p>
      
      <div style="background: #f9f9f9; padding: 20px; border-radius: 5px; margin: 20px 0;">
        <h3 style="margin-top: 0;">Return Details</h3>
        <p><strong>Return ID:</strong> ${returnRequest.id}</p>
        <p><strong>Reason:</strong> ${returnRequest.reason}</p>
        <p><strong>Refund Amount:</strong> ₹${returnRequest.refundAmount || order.total}</p>
      </div>
      
      <div style="background: #e3f2fd; padding: 15px; border-left: 4px solid #2196F3; margin: 20px 0;">
        <p style="margin: 0;"><strong>Next Steps:</strong></p>
        <ol style="margin: 10px 0; padding-left: 20px;">
          <li>Pack the item securely in its original packaging</li>
          <li>Our courier will pick up the package within 2-3 business days</li>
          <li>Refund will be processed within 5-7 days after we receive the item</li>
        </ol>
      </div>
      
      <div style="text-align: center; color: #999; font-size: 12px; margin-top: 30px;">
        <p>Thank you for your patience!</p>
        <p>&copy; ${new Date().getFullYear()} BLACKONN. All rights reserved.</p>
      </div>
    </div>
  `;

  return sendEmail({
    to: order.email || order.shippingInfo.email,
    subject,
    html,
    text: `Your return request has been approved. Refund of ₹${returnRequest.refundAmount} will be processed in 5-7 days.`
  });
};

/**
 * Send Promotional Email
 */
const sendPromotionalEmail = async (user, promotion) => {
  const subject = promotion.subject || `Special Offer Just for You! 🎉`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 2px;">
      <div style="background: white; padding: 30px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #000; margin: 0;">BLACKONN</h1>
        </div>
        
        ${promotion.bannerUrl ? `
        <div style="text-align: center; margin: 20px 0;">
          <img src="${promotion.bannerUrl}" alt="Promotion" style="max-width: 100%; height: auto; border-radius: 10px;">
        </div>
        ` : ''}
        
        <div style="text-align: center; padding: 30px 0;">
          <h2 style="color: #667eea; font-size: 28px; margin: 0;">${promotion.title}</h2>
          <p style="font-size: 16px; color: #666; margin: 15px 0;">${promotion.description}</p>
          
          ${promotion.discountPercent ? `
          <div style="background: #FFB400; color: #000; padding: 20px; margin: 20px 0; border-radius: 10px; display: inline-block;">
            <p style="margin: 0; font-size: 36px; font-weight: bold;">${promotion.discountPercent}% OFF</p>
          </div>
          ` : ''}
          
          ${promotion.couponCode ? `
          <div style="margin: 20px 0;">
            <p style="margin: 10px 0;">Use code:</p>
            <div style="background: #f9f9f9; border: 2px dashed #667eea; padding: 15px; display: inline-block; font-size: 24px; font-weight: bold; letter-spacing: 2px;">
              ${promotion.couponCode}
            </div>
          </div>
          ` : ''}
          
          ${promotion.validTill ? `
          <p style="color: #999; font-size: 14px; margin: 20px 0;">Valid till: ${new Date(promotion.validTill).toLocaleDateString()}</p>
          ` : ''}
        </div>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="${promotion.ctaUrl || `${process.env.FRONTEND_URL || 'https://blackonn.com'}/products.html`}" 
             style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: #fff; padding: 15px 40px; text-decoration: none; border-radius: 25px; font-weight: bold; display: inline-block;">
            ${promotion.ctaText || 'Shop Now'}
          </a>
        </div>
        
        <div style="text-align: center; color: #999; font-size: 12px; margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee;">
          <p>Don't want these emails? <a href="${process.env.FRONTEND_URL || 'https://blackonn.com'}/unsubscribe">Unsubscribe</a></p>
          <p>&copy; ${new Date().getFullYear()} BLACKONN. All rights reserved.</p>
        </div>
      </div>
    </div>
  `;

  return sendEmail({
    to: user.email,
    subject,
    html,
    text: `${promotion.title} - ${promotion.description}. Use code: ${promotion.couponCode || 'Visit website'}`
  });
};

/**
 * Send Newsletter
 */
const sendNewsletter = async (subscribers, newsletter) => {
  const results = [];
  
  for (const subscriber of subscribers) {
    const result = await sendEmail({
      to: subscriber.email,
      subject: newsletter.subject,
      html: newsletter.html,
      text: newsletter.text
    });
    results.push({ email: subscriber.email, success: !!result });
    
    // Add small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  return results;
};

/**
 * Send Account Verification Email
 */
const sendAccountVerification = async (user, verificationToken) => {
  const verificationUrl = `${process.env.FRONTEND_URL || 'https://blackonn.com'}/verify-email?token=${verificationToken}`;
  const subject = 'Verify Your Email - BLACKONN';
  
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #eee; padding: 20px;">
      <div style="text-align: center; margin-bottom: 30px;">
        <h1 style="color: #000; margin: 0;">BLACKONN</h1>
      </div>
      
      <p>Hi ${user.fullName || user.name},</p>
      <p>Thank you for registering with BLACKONN! Please verify your email address to activate your account.</p>
      
      <div style="text-align: center; margin: 30px 0;">
        <a href="${verificationUrl}" 
           style="background: #4CAF50; color: #fff; padding: 15px 40px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">
          Verify Email Address
        </a>
      </div>
      
      <p style="color: #666; font-size: 14px;">Or copy and paste this link in your browser:</p>
      <p style="word-break: break-all; background: #f9f9f9; padding: 10px; border-radius: 5px; font-size: 12px;">${verificationUrl}</p>
      
      <p style="color: #999; font-size: 12px; margin-top: 30px;">This link will expire in 24 hours. If you didn't create this account, please ignore this email.</p>
      
      <div style="text-align: center; color: #999; font-size: 12px; margin-top: 30px;">
        <p>&copy; ${new Date().getFullYear()} BLACKONN. All rights reserved.</p>
      </div>
    </div>
  `;

  return sendEmail({
    to: user.email,
    subject,
    html,
    text: `Verify your email: ${verificationUrl}`
  });
};

/**
 * Send New Order Notification to Admin
 */
const sendNewOrderAdmin = async (order) => {
  const adminEmail = process.env.ADMIN_EMAIL || process.env.EMAIL_USER;
  if (!adminEmail) return;

  const itemsHtml = order.items.map(item => `
    <tr>
      <td style="padding: 10px; border-bottom: 1px solid #eee;">${item.name}</td>
      <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: center;">x${item.quantity}</td>
      <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right;">₹${item.price * item.quantity}</td>
    </tr>
  `).join('');

  const subject = `🛍️ New Order: #${order.id.slice(-8).toUpperCase()}`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #eee; padding: 20px;">
      <div style="background: #4CAF50; color: white; padding: 15px; margin-bottom: 20px; border-radius: 5px;">
        <h2 style="margin: 0;">📦 New Order Received!</h2>
      </div>
      
      <div style="background: #f9f9f9; padding: 15px; border-radius: 5px; margin: 20px 0;">
        <p style="margin: 5px 0;"><strong>Order ID:</strong> #${order.id.toUpperCase()}</p>
        <p style="margin: 5px 0;"><strong>Date:</strong> ${new Date(order.createdAt).toLocaleString()}</p>
        <p style="margin: 5px 0;"><strong>Payment:</strong> ${order.paymentMethod}</p>
        <p style="margin: 5px 0;"><strong>Total:</strong> ₹${order.total}</p>
      </div>
      
      <h3>Customer Details</h3>
      <div style="background: #f9f9f9; padding: 15px; border-radius: 5px; margin: 20px 0;">
        <p style="margin: 5px 0;"><strong>Name:</strong> ${order.shippingInfo.name}</p>
        <p style="margin: 5px 0;"><strong>Email:</strong> ${order.email || order.shippingInfo.email || 'N/A'}</p>
        <p style="margin: 5px 0;"><strong>Phone:</strong> ${order.shippingInfo.phone}</p>
        <p style="margin: 5px 0;"><strong>Address:</strong> ${order.shippingInfo.address}, ${order.shippingInfo.city}, ${order.shippingInfo.state} - ${order.shippingInfo.pincode}</p>
      </div>
      
      <h3>Order Items</h3>
      <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
        <thead>
          <tr style="background: #f9f9f9;">
            <th style="padding: 10px; text-align: left;">Item</th>
            <th style="padding: 10px; text-align: center;">Qty</th>
            <th style="padding: 10px; text-align: right;">Price</th>
          </tr>
        </thead>
        <tbody>
          ${itemsHtml}
        </tbody>
      </table>
      
      <div style="text-align: center; margin: 30px 0;">
        <a href="${process.env.FRONTEND_URL || 'https://blackonn.com'}/admin.html#orders" 
           style="background: #000; color: #fff; padding: 12px 30px; text-decoration: none; border-radius: 5px; font-weight: bold;">
          View in Admin Panel
        </a>
      </div>
    </div>
  `;

  return sendEmail({
    to: adminEmail,
    subject,
    html,
    text: `New order #${order.id} for ₹${order.total} from ${order.shippingInfo.name}`
  });
};

/**
 * Send Bulk Emails
 */
const sendBulkEmails = async (recipients, emailData, delay = 100) => {
  const results = [];
  
  for (let i = 0; i < recipients.length; i++) {
    const result = await sendEmail({
      to: recipients[i].email,
      subject: emailData.subject,
      html: emailData.html,
      text: emailData.text
    });
    
    results.push({ 
      email: recipients[i].email, 
      success: !!result,
      name: recipients[i].name 
    });
    
    // Add delay to avoid rate limiting
    if (i < recipients.length - 1) {
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  return results;
};

module.exports = {
  // Core
  sendEmail,
  createTransporter,
  
  // User Emails
  sendOrderConfirmation,
  sendOrderShippedEmail,
  sendOrderDeliveredEmail,
  sendOrderCancelledEmail,
  sendPaymentConfirmation,
  sendPasswordResetOTP,
  sendWelcomeEmail,
  sendAccountVerification,
  sendAbandonedCartReminder,
  sendReturnApprovedEmail,
  sendPromotionalEmail,
  sendNewsletter,
  
  // Admin Emails
  sendLowStockAlert,
  sendContactNotification,
  sendNewOrderAdmin,
  
  // Bulk
  sendBulkEmails,
  
  // Constants
  EMAIL_TEMPLATES
};
