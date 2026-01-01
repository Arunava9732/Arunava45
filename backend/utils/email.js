/**
 * Email Utility for BLACKONN
 * Handles sending emails via SMTP (Nodemailer)
 */

const nodemailer = require('nodemailer');
const logger = require('./logger');

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
  try {
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
    return info;
  } catch (error) {
    logger.error(`Email failed to send: ${error.message}`);
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

module.exports = {
  sendEmail,
  sendOrderConfirmation,
  sendPasswordResetOTP,
  sendContactNotification
};
