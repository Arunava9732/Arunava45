/**
 * Payment Routes - Razorpay Integration
 * Handles payment gateway operations
 * 
 * Razorpay will only be active if RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET 
 * are configured in environment variables
 */

const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { authenticate, optionalAuth, requireAdmin } = require('../middleware/auth');
const db = require('../utils/database');
const { sendOrderConfirmation, sendLowStockAlert } = require('../utils/email');
const { 
  sendAdminNotification, 
  formatOrderMessage, 
  formatLowStockMessage,
  sendOrderConfirmationToUser
} = require('../utils/whatsapp');
const { addNotification } = require('../utils/adminNotificationStore');
const { sendOrderWebhook } = require('./webhooks');
const { aiRequestLogger, aiPerformanceMonitor } = require('../middleware/aiEnhancer');
const { payment: paymentAI, health: healthAI } = require('../utils/python_bridge');

const router = express.Router();

/**
 * Generates a 12-digit mixed alphanumeric Transaction ID with 'TXN' prefix
 * Format: TXN[12 alphanumeric chars]
 */
function generateTXNId() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = 'TXN';
  for (let i = 0; i < 12; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// AI Middleware
router.use(aiRequestLogger);
router.use(aiPerformanceMonitor(500));

// Payment Settings file path
const PAYMENT_SETTINGS_FILE = path.join(__dirname, '..', 'data', 'paymentSettings.json');

// Helper to get active Razorpay instance from settings or env
function getRazorpayInstance(settings) {
  // Use settings if available, otherwise fallback to process.env
  const keyId = settings?.automatic?.razorpay?.keyId || process.env.RAZORPAY_KEY_ID;
  const keySecret = settings?.automatic?.razorpay?.keySecret || process.env.RAZORPAY_KEY_SECRET;
  
  if (!keyId || !keySecret) return null;
  
  try {
    const Razorpay = require('razorpay');
    return new Razorpay({
      key_id: keyId,
      key_secret: keySecret
    });
  } catch (error) {
    console.error('Razorpay initialization error:', error);
    return null;
  }
}

// Helper to get Razorpay public key
function getRazorpayKeyId(settings) {
  return settings?.automatic?.razorpay?.keyId || process.env.RAZORPAY_KEY_ID;
}

// Default payment settings
const defaultPaymentSettings = {
  gatewayMode: 'manual',
  manual: {
    enabled: true,
    upi: {
      enabled: true,
      upiId: 'yourbusiness@ybl',
      displayName: 'BLACKONN',
      description: 'Pay using any UPI app'
    },
    bank: {
      enabled: false,
      accountName: '',
      accountNumber: '',
      ifscCode: '',
      bankName: '',
      branchName: ''
    },
    cod: {
      enabled: true,
      extraCharge: 40,
      maxOrderValue: 10000,
      minOrderValue: 0
    }
  },
  automatic: {
    enabled: false,
    selectedGateway: '',
    razorpay: {
      enabled: false,
      keyId: '',
      keySecret: '',
      webhookSecret: ''
    },
    payu: { merchantKey: '', salt: '', merchantId: '' },
    cashfree: { appId: '', secretKey: '' },
    phonepe: { merchantId: '', saltKey: '', saltIndex: '1' },
    paytm: { merchantId: '', merchantKey: '', website: '' },
    ccavenue: { merchantId: '', accessCode: '', workingKey: '' },
    instamojo: { apiKey: '', authToken: '', salt: '' },
    stripe: { publishableKey: '', secretKey: '', webhookSecret: '' },
    other: {
      enabled: false,
      gatewayName: '',
      merchantId: '',
      apiKey: '',
      apiSecret: '',
      webhookSecret: '',
      extraField1: '',
      extraField2: ''
    }
  },
  transactions: {
    totalCredited: 0,
    totalPending: 0,
    totalFailed: 0,
    lastUpdated: null
  },
  settings: {
    autoVerifyPayments: false,
    sendPaymentReceipts: true,
    paymentReminderHours: 24,
    refundProcessingDays: 7
  },
  updatedAt: null,
  updatedBy: null
};

// Read payment settings
function readPaymentSettings() {
  try {
    if (fs.existsSync(PAYMENT_SETTINGS_FILE)) {
      const data = JSON.parse(fs.readFileSync(PAYMENT_SETTINGS_FILE, 'utf8'));
      return { ...defaultPaymentSettings, ...data };
    }
    return defaultPaymentSettings;
  } catch (error) {
    console.error('Error reading payment settings:', error);
    return defaultPaymentSettings;
  }
}

// Write payment settings
function writePaymentSettings(settings) {
  try {
    fs.writeFileSync(PAYMENT_SETTINGS_FILE, JSON.stringify(settings, null, 2));
    return true;
  } catch (error) {
    console.error('Error writing payment settings:', error);
    return false;
  }
}

/**
 * GET /api/payment/mode
 * Ultra-fast endpoint to check payment mode (< 50ms response)
 * Supports multi-gateway system: returns gateway, mode, and public key
 */
router.get('/mode', (req, res) => {
  try {
    const settings = readPaymentSettings();
    const isAutomatic = settings.gatewayMode === 'automatic';
    const selectedGateway = settings.automatic?.selectedGateway;
    
    // Check if selected gateway has valid credentials
    let gatewayEnabled = false;
    let publicKey = null;
    let gatewayName = null;
    
    if (isAutomatic && settings.automatic?.[selectedGateway]) {
      const gw = settings.automatic[selectedGateway];
      switch(selectedGateway) {
        case 'razorpay':
          const rzpKey = gw.keyId || process.env.RAZORPAY_KEY_ID;
          const rzpSecret = gw.keySecret || process.env.RAZORPAY_KEY_SECRET;
          gatewayEnabled = !!(rzpKey && rzpSecret);
          publicKey = rzpKey;
          break;
        case 'stripe':
          gatewayEnabled = !!gw.publishableKey;
          publicKey = gw.publishableKey;
          break;
        case 'payu':
          gatewayEnabled = !!gw.merchantKey;
          publicKey = gw.merchantKey;
          break;
        case 'cashfree':
          gatewayEnabled = !!gw.appId;
          publicKey = gw.appId;
          break;
        case 'phonepe':
        case 'paytm':
          gatewayEnabled = !!gw.merchantId;
          publicKey = gw.merchantId;
          break;
        case 'ccavenue':
          gatewayEnabled = !!gw.accessCode;
          publicKey = gw.accessCode;
          break;
        case 'instamojo':
          gatewayEnabled = !!gw.apiKey;
          publicKey = gw.apiKey;
          break;
        case 'other':
          gatewayEnabled = !!(gw.apiKey || gw.merchantId);
          publicKey = gw.apiKey || gw.merchantId;
          gatewayName = gw.gatewayName || 'Custom Gateway';
          break;
      }
    }
    
    // For backward compatibility with older checkout code
    const isRazorpay = isAutomatic && selectedGateway === 'razorpay' && gatewayEnabled;
    
    res.json({
      mode: (isAutomatic && gatewayEnabled) ? selectedGateway : 'manual',
      gateway: selectedGateway,
      gatewayName: gatewayName || selectedGateway,
      keyId: isRazorpay ? publicKey : null, // Legacy field for Razorpay
      publicKey: publicKey,
      gatewayMode: settings.gatewayMode,
      codEnabled: settings.manual?.cod?.enabled || false,
      codCharge: settings.manual?.cod?.extraCharge || 0
    });
  } catch (error) {
    console.error('Payment mode check error:', error);
    res.json({ mode: 'manual', keyId: null, codEnabled: false });
  }
});

/**
 * GET /api/payment/config
 * Get payment gateway configuration (public)
 * Supports multi-gateway system with COD option
 */
router.get('/config', (req, res) => {
  try {
    const settings = readPaymentSettings();
    const isAutomatic = settings.gatewayMode === 'automatic';
    const selectedGateway = settings.automatic?.selectedGateway;
    
    // Check if selected gateway has valid credentials
    let gatewayEnabled = false;
    let publicKey = null;
    let gatewayName = null;
    
    if (isAutomatic && settings.automatic?.[selectedGateway]) {
      const gw = settings.automatic[selectedGateway];
      switch(selectedGateway) {
        case 'razorpay':
          const rzpKey = gw.keyId || process.env.RAZORPAY_KEY_ID;
          const rzpSecret = gw.keySecret || process.env.RAZORPAY_KEY_SECRET;
          gatewayEnabled = !!(rzpKey && rzpSecret);
          publicKey = rzpKey;
          break;
        case 'stripe':
          gatewayEnabled = !!gw.publishableKey;
          publicKey = gw.publishableKey;
          break;
        case 'payu':
          gatewayEnabled = !!gw.merchantKey;
          publicKey = gw.merchantKey;
          break;
        case 'cashfree':
          gatewayEnabled = !!gw.appId;
          publicKey = gw.appId;
          break;
        case 'phonepe':
        case 'paytm':
          gatewayEnabled = !!gw.merchantId;
          publicKey = gw.merchantId;
          break;
        case 'ccavenue':
          gatewayEnabled = !!gw.accessCode;
          publicKey = gw.accessCode;
          break;
        case 'instamojo':
          gatewayEnabled = !!gw.apiKey;
          publicKey = gw.apiKey;
          break;
        case 'other':
          gatewayEnabled = !!(gw.apiKey || gw.merchantId);
          publicKey = gw.apiKey || gw.merchantId;
          gatewayName = gw.gatewayName || 'Custom Gateway';
          break;
      }
    }
    
    // For backward compatibility
    const razorpayEnabled = isAutomatic && selectedGateway === 'razorpay' && gatewayEnabled;
    
    res.json({
      success: true,
      gatewayMode: settings.gatewayMode,
      selectedGateway: selectedGateway,
      gatewayName: gatewayName || selectedGateway,
      gatewayEnabled: gatewayEnabled,
      publicKey: publicKey,
      // Legacy Razorpay fields for backwards compatibility
      razorpayEnabled: razorpayEnabled,
      keyId: razorpayEnabled ? publicKey : null,
      // COD settings
      codEnabled: settings.manual?.cod?.enabled || false,
      codCharge: settings.manual?.cod?.extraCharge || 0,
      codMinOrder: settings.manual?.cod?.minOrderValue || 0,
      codMaxOrder: settings.manual?.cod?.maxOrderValue || 50000,
      // UPI settings for manual mode
      upiEnabled: settings.manual?.upi?.enabled || false,
      // Available payment methods based on gateway
      paymentMethods: (isAutomatic && gatewayEnabled) ? {
        card: true,
        upi: true,
        netbanking: true,
        wallet: true,
        emi: false,
        cod: settings.manual?.cod?.enabled || false
      } : {
        upi: settings.manual?.upi?.enabled || true,
        card: false,
        netbanking: false,
        wallet: false,
        cod: settings.manual?.cod?.enabled || false
      }
    });
  } catch (error) {
    console.error('Payment config error:', error);
    res.status(500).json({ success: false, error: 'Failed to get payment config' });
  }
});

/**
 * POST /api/payment/create-order
 * Create a Razorpay order for payment
 * Requires authentication
 */
router.post('/create-order', authenticate, async (req, res) => {
  try {
    const settings = readPaymentSettings();
    const selectedGateway = settings.automatic?.selectedGateway;
    const isAutomatic = settings.gatewayMode === 'automatic';

    const { amount, currency = 'INR', orderId, receipt, notes = {} } = req.body;

    // Handle generic automatic gateway support
    if (isAutomatic && selectedGateway !== 'razorpay') {
      // For other gateways (Stripe, PhonePe, etc.)
      // We return the gateway type and amount so the frontend knows how to handle it
      return res.json({
        success: true,
        gateway: selectedGateway,
        order: {
          id: `tmp_${selectedGateway}_${Date.now()}`,
          amount: amount,
          currency: currency
        },
        publicKey: settings.automatic?.[selectedGateway]?.publicKey || ''
      });
    }

    // Default to Razorpay if it's the selected gateway or if fallback is needed
    const razorpay = getRazorpayInstance(settings);
    if (!razorpay) {
      return res.status(400).json({ 
        success: false, 
        error: 'Razorpay payment gateway is not configured but is selected for payment' 
      });
    }

    // Validate amount
    if (!amount || amount <= 0) {
      return res.status(400).json({ success: false, error: 'Invalid amount' });
    }

    // Amount should be in paise for Razorpay
    const amountInPaise = Math.round(amount * 100);

    // Create Razorpay order
    const options = {
      amount: amountInPaise,
      currency: currency,
      receipt: receipt || `order_${Date.now()}`,
      notes: {
        ...notes,
        orderId: orderId,
        userId: req.user.id,
        userEmail: req.user.email
      }
    };

    const razorpayOrder = await razorpay.orders.create(options);

    res.json({
      success: true,
      gateway: 'razorpay',
      order: {
        id: razorpayOrder.id,
        amount: razorpayOrder.amount,
        currency: razorpayOrder.currency,
        receipt: razorpayOrder.receipt
      },
      keyId: getRazorpayKeyId(settings)
    });
  } catch (error) {
    console.error('Create Razorpay order error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to create payment order' 
    });
  }
});

/**
 * POST /api/payment/verify
 * Verify Razorpay payment signature and update order
 * Uses AI-powered fraud detection
 * Requires authentication
 */
router.post('/verify', authenticate, async (req, res) => {
  try {
    const { 
      razorpay_order_id, 
      razorpay_payment_id, 
      razorpay_signature,
      orderId, // Our internal order ID
      isFreeOrder = false,
      isManual = false,
      transactionId
    } = req.body;

    // 1. Handle Free Orders (Total 0)
    if (isFreeOrder) {
      const order = orderId ? db.orders.findById(orderId) : null;
      if (!order) {
        return res.status(404).json({ success: false, error: 'Order not found' });
      }
      
      if (order.total > 0) {
        return res.status(400).json({ success: false, error: 'Free order validation failed: Total is not zero' });
      }

      // Mark order as paid
      const updatedOrder = db.orders.update(order.id, {
        paymentStatus: 'Paid',
        paymentMethod: 'Discounted',
        transactionId: 'FREE_' + Date.now(),
        status: 'Confirmed',
        paymentConfirmed: true,
        updatedAt: new Date().toISOString()
      });

      // Add notification for admin
      addNotification({
        type: 'payment',
        title: 'New Fully Discounted Order',
        message: `Order #${order.id} verified with 0 total.`,
        data: { orderId: order.id }
      });

      // Send notifications
      const userEmail = updatedOrder.userEmail || (updatedOrder.shippingInfo && updatedOrder.shippingInfo.email);
      if (userEmail) {
        sendOrderConfirmation(updatedOrder, userEmail).catch(err => console.error('Free order email failed:', err));
      }
      
      const userPhone = updatedOrder.shippingInfo?.phone || (req.user && req.user.phone);
      if (userPhone) {
        sendOrderConfirmationToUser(userPhone, updatedOrder).catch(err => console.error('Free order WhatsApp failed:', err));
      }

      return res.json({ success: true, message: 'Free order verified' });
    }

    // 2. Handle Manual Payments (UPI/QR)
    if (isManual) {
      const order = orderId ? db.orders.findById(orderId) : null;
      if (!order) {
        return res.status(404).json({ success: false, error: 'Order not found' });
      }

      // Generate a custom TXN ID if not provided (allows skipping UTR input)
      const finalTransactionId = transactionId || generateTXNId();

      // Mark order as pending verification
      const updatedOrder = db.orders.update(order.id, {
        paymentStatus: 'Verification Pending',
        paymentMethod: 'UPI',
        transactionId: finalTransactionId,
        verificationRequestedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
      
      // ============ AI-POWERED FRAUD DETECTION (Manual Mode) ============
      try {
        const userOrders = db.orders.findAll().filter(o => o.userId === req.user.id);
        const userHistory = {
          orders: userOrders,
          preferredPaymentMethod: req.user.preferredPaymentMethod,
          country: req.user.country
        };
        
        const paymentData = {
          orderId: order.id,
          amount: order.total,
          method: 'UPI_MANUAL',
          transactionId: finalTransactionId,
          email: req.user.email,
          userId: req.user.id,
          ip: req.ip,
          userAgent: req.get('User-Agent'),
          timestamp: new Date().toISOString(),
          isManual: true
        };
        
        const aiVerification = await paymentAI.verify(paymentData, order, userHistory);
        console.log(`[AI Manual Payment Analysis] Risk: ${aiVerification.riskLevel}, Score: ${aiVerification.riskScore}`);
        
        // If high risk, notify admin specifically
        if (aiVerification.riskScore > 70) {
          addNotification({
            type: 'HIGH_RISK_PAYMENT',
            title: 'High Risk Payment Alert',
            message: `Manual payment for Order #${order.id} flagged as ${aiVerification.riskLevel}. ${aiVerification.riskFactors.join(', ')}`,
            severity: 'critical',
            data: { orderId: order.id, riskScore: aiVerification.riskScore }
          });
        }
      } catch (aiErr) {
        console.error('AI manual payment analysis failed:', aiErr);
      }

      // Add notification for admin to verify manually
      addNotification({
        type: 'PAYMENT_VERIFICATION_REQUIRED',
        title: 'Manual Payment Submitted',
        message: `User submitted payment for Order #${order.id}. Please verify transaction ${finalTransactionId}.`,
        severity: 'high',
        data: { orderId: order.id, transactionId: finalTransactionId }
      });

      return res.json({ 
        success: true, 
        message: 'Manual payment submitted for verification',
        order: updatedOrder 
      });
    }

    // 3. Handle Automatic Gateway (Razorpay/Stripe etc)
    // For now, Razorpay is the primary automatic gateway integrated with SDK
    const settings = readPaymentSettings();
    const razorpay = getRazorpayInstance(settings);
    if (!razorpay) {
      return res.status(400).json({ 
        success: false, 
        error: 'Razorpay payment gateway is not configured for verification' 
      });
    }

    // Validate required fields for Razorpay
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing payment verification data' 
      });
    }

    // Verify signature
    const body = razorpay_order_id + '|' + razorpay_payment_id;
    const keySecret = settings?.automatic?.razorpay?.keySecret || process.env.RAZORPAY_KEY_SECRET;
    const expectedSignature = crypto
      .createHmac('sha256', keySecret)
      .update(body.toString())
      .digest('hex');

    const isSignatureValid = expectedSignature === razorpay_signature;

    if (!isSignatureValid) {
      return res.status(400).json({ 
        success: false, 
        error: 'Payment verification failed - Invalid signature' 
      });
    }

    // Double-check: Fetch payment from Razorpay to verify status
    let paymentDetails = null;
    if (razorpay) {
      try {
        paymentDetails = await razorpay.payments.fetch(razorpay_payment_id);
        console.log('Razorpay payment status:', paymentDetails.status, 'Amount:', paymentDetails.amount / 100);
        
        // Check if payment is actually captured/authorized
        if (paymentDetails.status !== 'captured' && paymentDetails.status !== 'authorized') {
          return res.status(400).json({
            success: false,
            error: `Payment not completed. Status: ${paymentDetails.status}`
          });
        }
      } catch (fetchError) {
        console.error('Failed to fetch payment from Razorpay:', fetchError);
        // Continue with signature verification only if fetch fails
        // Signature is still valid, so we can proceed
      }
    }

    // Find the order
    const order = orderId ? db.orders.findById(orderId) : null;
    
    // ============ AI-POWERED FRAUD DETECTION ============
    let aiVerification = null;
    try {
      // Get user history for better fraud detection
      const userOrders = db.orders.findAll().filter(o => o.userId === req.user.id);
      const userHistory = {
        orders: userOrders,
        preferredPaymentMethod: req.user.preferredPaymentMethod,
        country: req.user.country
      };
      
      // Prepare payment data for AI verification
      const paymentData = {
        razorpay_order_id,
        razorpay_payment_id,
        razorpay_signature,
        secret: settings.automatic?.razorpay?.keySecret || process.env.RAZORPAY_KEY_SECRET,
        signatureVerified: isSignatureValid,
        amount: paymentDetails ? paymentDetails.amount / 100 : (order ? order.total : 0),
        method: paymentDetails ? paymentDetails.method : 'unknown',
        email: req.user.email,
        userId: req.user.id,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        timestamp: new Date().toISOString()
      };
      
      // Run AI verification
      aiVerification = await paymentAI.verify(paymentData, order, userHistory);
      console.log(`[AI Payment Verification] Risk: ${aiVerification.riskLevel}, Score: ${aiVerification.riskScore}, Action: ${aiVerification.action}`);
      
      // Block if AI detects critical fraud
      if (aiVerification.action === 'BLOCK') {
        console.warn(`[FRAUD BLOCKED] Payment ${razorpay_payment_id} blocked by AI. Risk factors: ${aiVerification.riskFactors.join(', ')}`);
        return res.status(403).json({
          success: false,
          error: 'Payment flagged for security review',
          reviewRequired: true
        });
      }
    } catch (aiError) {
      console.error('AI verification error (continuing with standard verification):', aiError.message);
      // Don't block payment if AI fails, just log it
    }

    // Find and update the order
    if (order) {
        // Verify amount matches (if we fetched payment details)
        if (paymentDetails && paymentDetails.amount) {
          const expectedAmount = Math.round(order.total * 100); // Convert to paise
          if (paymentDetails.amount !== expectedAmount) {
            console.error('Amount mismatch! Expected:', expectedAmount, 'Got:', paymentDetails.amount);
            return res.status(400).json({
              success: false,
              error: 'Payment amount mismatch'
            });
          }
        }

        // Update order with payment confirmation
        const updates = {
          paymentStatus: 'Completed',
          paymentConfirmed: true,
          status: 'Confirmed',
          transactionId: razorpay_payment_id, // Standardize transactionId
          razorpayOrderId: razorpay_order_id,
          razorpayPaymentId: razorpay_payment_id,
          razorpayPaymentStatus: paymentDetails ? paymentDetails.status : 'verified',
          razorpayPaymentMethod: paymentDetails ? paymentDetails.method : null,
          aiVerification: aiVerification ? {
            riskScore: aiVerification.riskScore,
            riskLevel: aiVerification.riskLevel,
            action: aiVerification.action,
            verified: aiVerification.verified
          } : null,
          updatedAt: new Date().toISOString()
        };

        const updatedOrder = db.orders.update(orderId, updates);

        // Add to Admin Notification Panel
        addNotification({
          type: 'payment',
          title: 'Payment Confirmed',
          message: `Payment of ₹${updatedOrder.total.toLocaleString()} received for Order #${orderId}`,
          priority: 'medium',
          link: '#orders',
          data: { orderId: orderId, paymentId: razorpay_payment_id }
        });

        // Add fraud alert notification if risk is high
        if (aiVerification && (aiVerification.riskLevel === 'High' || aiVerification.riskLevel === 'Critical')) {
          addNotification({
            type: 'security_alert',
            title: 'CRITICAL: High Risk Payment Detected',
            message: `Order #${orderId} has a high fraud risk score (${aiVerification.riskScore}). Verification required.`,
            priority: 'high',
            link: '#orders',
            data: { orderId: orderId, riskScore: aiVerification.riskScore }
          });
        }

        console.log(`[AI-Enhanced] Payment verified: Order ${orderId}, Payment ID ${razorpay_payment_id}, AI Risk: ${aiVerification ? aiVerification.riskLevel : 'N/A'}`);

        // Send notifications for confirmed payment
        sendOrderWebhook && sendOrderWebhook('order.created', updatedOrder);

        // Send order confirmation email
        const userEmail = order.userEmail || (order.shippingInfo && order.shippingInfo.email);
        if (userEmail) {
          sendOrderConfirmation(updatedOrder, userEmail).catch(err => 
            console.error('Order email failed:', err)
          );
        }

        // Send Order Confirmation WhatsApp to User
        const userPhone = order.shippingInfo?.phone || (req.user && req.user.phone);
        if (userPhone) {
          sendOrderConfirmationToUser(userPhone, updatedOrder).catch(err => 
            console.error('WhatsApp order confirmation failed:', err.message)
          );
        }

        // Send WhatsApp notification to admin
        sendAdminNotification(formatOrderMessage(updatedOrder)).catch(err => 
          console.error('WhatsApp admin notification failed:', err)
        );

        // Update product stock
        if (order.items && Array.isArray(order.items)) {
          order.items.forEach(item => {
            const productId = item.id || item.productId;
            const product = db.products.findById(productId);
            if (product) {
              const newStock = Math.max(0, (product.stock || 0) - (item.quantity || 1));
              db.products.update(productId, { stock: newStock });

              // Trigger low stock alert
              if (newStock <= 5) {
                // Add to Admin Notification Panel
                addNotification({
                  type: 'low_stock',
                  title: 'Low Stock Alert',
                  message: `Product "${product.name}" is low on stock (${newStock} remaining)`,
                  priority: 'high',
                  link: '#products',
                  data: { productId: product.id, stock: newStock }
                });

                sendLowStockAlert({ ...product, stock: newStock }).catch(err => 
                  console.error('Low stock alert failed:', err)
                );
                sendAdminNotification(formatLowStockMessage({ ...product, stock: newStock })).catch(err => 
                  console.error('WhatsApp low stock alert failed:', err)
                );
              }
            }
          });
        }

        // Clear user's cart
        const carts = db.carts.findAll();
        if (typeof carts === 'object' && order.userId) {
          delete carts[order.userId];
          db.carts.replaceAll(carts);
        }

        return res.json({
          success: true,
          message: 'Payment verified successfully',
          order: updatedOrder
        });
    }

    // If no order ID provided, just return verification success
    res.json({
      success: true,
      message: 'Payment verified successfully',
      paymentId: razorpay_payment_id
    });
  } catch (error) {
    console.error('Payment verification error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Payment verification failed' 
    });
  }
});

/**
 * GET /api/payment/status/:paymentId
 * Check payment status from Razorpay (for verification)
 * Requires authentication
 */
router.get('/status/:paymentId', authenticate, async (req, res) => {
  try {
    const settings = readPaymentSettings();
    const razorpay = getRazorpayInstance(settings);
    // Check if Razorpay is configured
    if (!razorpay) {
      return res.status(400).json({ 
        success: false, 
        error: 'Razorpay payment gateway is not configured' 
      });
    }

    const { paymentId } = req.params;

    if (!paymentId) {
      return res.status(400).json({ success: false, error: 'Payment ID is required' });
    }

    // Fetch payment from Razorpay
    const payment = await razorpay.payments.fetch(paymentId);

    res.json({
      success: true,
      payment: {
        id: payment.id,
        orderId: payment.order_id,
        amount: payment.amount / 100, // Convert paise to rupees
        currency: payment.currency,
        status: payment.status,
        method: payment.method,
        email: payment.email,
        contact: payment.contact,
        captured: payment.captured,
        createdAt: new Date(payment.created_at * 1000).toISOString()
      }
    });
  } catch (error) {
    console.error('Payment status check error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to fetch payment status' 
    });
  }
});

/**
 * GET /api/payment/order-status/:razorpayOrderId
 * Check Razorpay order status and payments
 * Requires authentication
 */
router.get('/order-status/:razorpayOrderId', authenticate, async (req, res) => {
  try {
    const settings = readPaymentSettings();
    const razorpay = getRazorpayInstance(settings);
    // Check if Razorpay is configured
    if (!razorpay) {
      return res.status(400).json({ 
        success: false, 
        error: 'Razorpay payment gateway is not configured' 
      });
    }

    const { razorpayOrderId } = req.params;

    if (!razorpayOrderId) {
      return res.status(400).json({ success: false, error: 'Razorpay Order ID is required' });
    }

    // Fetch order from Razorpay
    const order = await razorpay.orders.fetch(razorpayOrderId);
    
    // Fetch payments for this order
    const payments = await razorpay.orders.fetchPayments(razorpayOrderId);

    res.json({
      success: true,
      order: {
        id: order.id,
        amount: order.amount / 100,
        currency: order.currency,
        status: order.status,
        receipt: order.receipt,
        attempts: order.attempts,
        createdAt: new Date(order.created_at * 1000).toISOString()
      },
      payments: payments.items.map(p => ({
        id: p.id,
        amount: p.amount / 100,
        status: p.status,
        method: p.method,
        captured: p.captured
      })),
      isPaid: payments.items.some(p => p.status === 'captured')
    });
  } catch (error) {
    console.error('Order status check error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to fetch order status' 
    });
  }
});

/**
 * POST /api/payment/refund
 * Initiate a refund for a payment (Admin only)
 */
router.post('/refund', authenticate, async (req, res) => {
  try {
    // Check admin role
    if (req.user.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'Admin access required' });
    }

    const settings = readPaymentSettings();
    const razorpay = getRazorpayInstance(settings);
    // Check if Razorpay is configured
    if (!razorpay) {
      return res.status(400).json({ 
        success: false, 
        error: 'Razorpay payment gateway is not configured' 
      });
    }

    const { paymentId, amount, notes = {} } = req.body;

    if (!paymentId) {
      return res.status(400).json({ success: false, error: 'Payment ID is required' });
    }

    // Amount in paise (if partial refund)
    const refundOptions = {
      notes: {
        ...notes,
        refundedBy: req.user.email,
        refundedAt: new Date().toISOString()
      }
    };

    if (amount) {
      refundOptions.amount = Math.round(amount * 100);
    }

    const refund = await razorpay.payments.refund(paymentId, refundOptions);

    res.json({
      success: true,
      refund: {
        id: refund.id,
        amount: refund.amount / 100,
        status: refund.status
      }
    });
  } catch (error) {
    console.error('Refund error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to process refund' 
    });
  }
});

/**
 * POST /api/payment/webhook
 * Razorpay webhook handler for payment events
 * No authentication - verified via signature
 */
router.post('/webhook', express.raw({ type: 'application/json' }), (req, res) => {
  try {
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
    
    if (!webhookSecret) {
      console.log('Razorpay webhook received but no secret configured');
      return res.status(200).json({ received: true });
    }

    // Verify webhook signature
    const signature = req.headers['x-razorpay-signature'];
    const body = req.body;

    const expectedSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(body)
      .digest('hex');

    if (signature !== expectedSignature) {
      console.error('Razorpay webhook signature verification failed');
      return res.status(400).json({ error: 'Invalid signature' });
    }

    const event = JSON.parse(body);
    console.log('Razorpay webhook event:', event.event);

    // Handle different event types
    switch (event.event) {
      case 'payment.captured':
        // Payment successful
        const payment = event.payload.payment.entity;
        console.log('Payment captured:', payment.id);
        // You can update order status here based on notes.orderId
        break;

      case 'payment.failed':
        // Payment failed
        const failedPayment = event.payload.payment.entity;
        console.log('Payment failed:', failedPayment.id);
        break;

      case 'refund.created':
        // Refund initiated
        const refund = event.payload.refund.entity;
        console.log('Refund created:', refund.id);
        break;

      default:
        console.log('Unhandled webhook event:', event.event);
    }

    res.status(200).json({ received: true });
  } catch (error) {
    console.error('Webhook processing error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// ============ PAYMENT GATEWAY SETTINGS (ADMIN) ============

/**
 * GET /api/payment/gateway-settings
 * Get payment gateway settings (admin only)
 */
router.get('/gateway-settings', authenticate, requireAdmin, (req, res) => {
  try {
    const settings = readPaymentSettings();
    
    // Don't expose secrets in response
    if (settings.automatic?.razorpay?.keySecret) {
      settings.automatic.razorpay.keySecret = settings.automatic.razorpay.keySecret ? '••••••••' : '';
    }
    if (settings.automatic?.razorpay?.webhookSecret) {
      settings.automatic.razorpay.webhookSecret = settings.automatic.razorpay.webhookSecret ? '••••••••' : '';
    }
    
    res.json({ success: true, settings });
  } catch (error) {
    console.error('Get payment settings error:', error);
    res.status(500).json({ success: false, error: 'Failed to get payment settings' });
  }
});

/**
 * PUT /api/payment/gateway-settings
 * Update payment gateway settings (admin only)
 */
router.put('/gateway-settings', authenticate, requireAdmin, (req, res) => {
  try {
    const currentSettings = readPaymentSettings();
    const updates = req.body;
    
    // Deep merge settings
    const newSettings = {
      ...currentSettings,
      ...updates,
      manual: {
        ...currentSettings.manual,
        ...updates.manual,
        upi: { ...currentSettings.manual?.upi, ...updates.manual?.upi },
        bank: { ...currentSettings.manual?.bank, ...updates.manual?.bank },
        cod: { ...currentSettings.manual?.cod, ...updates.manual?.cod }
      },
      automatic: {
        ...currentSettings.automatic,
        ...updates.automatic,
        razorpay: { ...currentSettings.automatic?.razorpay, ...updates.automatic?.razorpay },
        payu: { ...currentSettings.automatic?.payu, ...updates.automatic?.payu },
        cashfree: { ...currentSettings.automatic?.cashfree, ...updates.automatic?.cashfree },
        phonepe: { ...currentSettings.automatic?.phonepe, ...updates.automatic?.phonepe },
        paytm: { ...currentSettings.automatic?.paytm, ...updates.automatic?.paytm },
        ccavenue: { ...currentSettings.automatic?.ccavenue, ...updates.automatic?.ccavenue },
        instamojo: { ...currentSettings.automatic?.instamojo, ...updates.automatic?.instamojo },
        stripe: { ...currentSettings.automatic?.stripe, ...updates.automatic?.stripe },
        other: { ...currentSettings.automatic?.other, ...updates.automatic?.other }
      },
      settings: { ...currentSettings.settings, ...updates.settings },
      updatedAt: new Date().toISOString(),
      updatedBy: req.user.id
    };
    
    // If secrets are masked, preserve original
    if (newSettings.automatic?.razorpay?.keySecret === '••••••••') {
      newSettings.automatic.razorpay.keySecret = currentSettings.automatic?.razorpay?.keySecret || '';
    }
    if (newSettings.automatic?.razorpay?.webhookSecret === '••••••••') {
      newSettings.automatic.razorpay.webhookSecret = currentSettings.automatic?.razorpay?.webhookSecret || '';
    }
    if (newSettings.automatic?.stripe?.secretKey === '••••••••') {
      newSettings.automatic.stripe.secretKey = currentSettings.automatic?.stripe?.secretKey || '';
    }
    if (newSettings.automatic?.other?.apiSecret === '••••••••') {
      newSettings.automatic.other.apiSecret = currentSettings.automatic?.other?.apiSecret || '';
    }
    if (newSettings.automatic?.other?.webhookSecret === '••••••••') {
      newSettings.automatic.other.webhookSecret = currentSettings.automatic?.other?.webhookSecret || '';
    }
    
    if (writePaymentSettings(newSettings)) {
      // Mask secrets in response
      const responseSettings = { ...newSettings };
      if (responseSettings.automatic?.razorpay?.keySecret) {
        responseSettings.automatic.razorpay.keySecret = '••••••••';
      }
      if (responseSettings.automatic?.razorpay?.webhookSecret) {
        responseSettings.automatic.razorpay.webhookSecret = '••••••••';
      }
      if (responseSettings.automatic?.stripe?.secretKey) {
        responseSettings.automatic.stripe.secretKey = '••••••••';
      }
      if (responseSettings.automatic?.other?.apiSecret) {
        responseSettings.automatic.other.apiSecret = '••••••••';
      }
      if (responseSettings.automatic?.other?.webhookSecret) {
        responseSettings.automatic.other.webhookSecret = '••••••••';
      }
      
      res.json({ success: true, settings: responseSettings, message: 'Payment settings updated successfully' });
    } else {
      res.status(500).json({ success: false, error: 'Failed to save settings' });
    }
  } catch (error) {
    console.error('Update payment settings error:', error);
    res.status(500).json({ success: false, error: 'Failed to update payment settings' });
  }
});

/**
 * GET /api/payment/public-settings
 * Get public payment settings for checkout (no auth required)
 * Only returns non-sensitive information needed for payment UI
 */
router.get('/public-settings', (req, res) => {
  try {
    const settings = readPaymentSettings();
    
    // Determine which automatic gateway is active
    const selectedGateway = settings.automatic?.selectedGateway;
    const isAutomatic = settings.gatewayMode === 'automatic';
    
    // Check if selected gateway has valid credentials (non-empty key/id)
    let gatewayEnabled = false;
    let gatewayPublicKey = null;
    let gatewayName = null;
    
    if (isAutomatic && settings.automatic?.[selectedGateway]) {
      const gw = settings.automatic[selectedGateway];
      switch(selectedGateway) {
        case 'razorpay':
          gatewayEnabled = !!gw.keyId;
          gatewayPublicKey = gw.keyId;
          break;
        case 'stripe':
          gatewayEnabled = !!gw.publishableKey;
          gatewayPublicKey = gw.publishableKey;
          break;
        case 'payu':
          gatewayEnabled = !!gw.merchantKey;
          gatewayPublicKey = gw.merchantKey;
          break;
        case 'cashfree':
          gatewayEnabled = !!gw.appId;
          gatewayPublicKey = gw.appId;
          break;
        case 'phonepe':
        case 'paytm':
          gatewayEnabled = !!gw.merchantId;
          gatewayPublicKey = gw.merchantId;
          break;
        case 'ccavenue':
          gatewayEnabled = !!gw.accessCode;
          gatewayPublicKey = gw.accessCode;
          break;
        case 'instamojo':
          gatewayEnabled = !!gw.apiKey;
          gatewayPublicKey = gw.apiKey;
          break;
        case 'other':
          gatewayEnabled = !!(gw.apiKey || gw.merchantId);
          gatewayPublicKey = gw.apiKey || gw.merchantId;
          gatewayName = gw.gatewayName || 'Custom Gateway';
          break;
      }
    }
    
    // Return only public-safe settings
    const publicSettings = {
      gatewayMode: settings.gatewayMode,
      // For UPI payment modal compatibility
      upi: settings.manual?.upi?.enabled ? {
        enabled: true,
        upiId: settings.manual.upi.upiId,
        displayName: settings.manual.upi.displayName || 'BLACKONN',
        description: settings.manual.upi.description || 'Pay using any UPI app'
      } : { enabled: false },
      manual: {
        upi: settings.manual?.upi?.enabled ? {
          enabled: true,
          upiId: settings.manual.upi.upiId,
          displayName: settings.manual.upi.displayName,
          description: settings.manual.upi.description
        } : { enabled: false },
        bank: settings.manual?.bank?.enabled ? {
          enabled: true,
          accountName: settings.manual.bank.accountName,
          accountNumber: settings.manual.bank.accountNumber ? 
            'XXXX' + settings.manual.bank.accountNumber.slice(-4) : '',
          ifscCode: settings.manual.bank.ifscCode,
          bankName: settings.manual.bank.bankName
        } : { enabled: false },
        cod: settings.manual?.cod?.enabled ? {
          enabled: true,
          extraCharge: settings.manual.cod.extraCharge,
          maxOrderValue: settings.manual.cod.maxOrderValue,
          minOrderValue: settings.manual.cod.minOrderValue
        } : { enabled: false }
      },
      // Automatic payment gateway info
      automatic: isAutomatic ? {
        enabled: gatewayEnabled,
        gateway: selectedGateway,
        gatewayName: gatewayName || selectedGateway,
        publicKey: gatewayPublicKey
      } : { enabled: false },
      // Legacy compatibility
      razorpayEnabled: settings.gatewayMode === 'automatic' && selectedGateway === 'razorpay' && gatewayEnabled
    };
    
    res.json({ success: true, settings: publicSettings });
  } catch (error) {
    console.error('Get public payment settings error:', error);
    res.status(500).json({ success: false, error: 'Failed to get payment settings' });
  }
});

/**
 * GET /api/payment/transactions/stats
 * Get transaction statistics (admin only)
 */
router.get('/transactions/stats', authenticate, requireAdmin, (req, res) => {
  try {
    const settings = readPaymentSettings();
    const orders = db.orders.findAll();
    
    // Calculate real transaction stats from orders
    let totalCredited = 0;
    let totalPending = 0;
    let totalFailed = 0;
    let todayCredited = 0;
    let weekCredited = 0;
    let monthCredited = 0;
    
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    
    orders.forEach(order => {
      const orderDate = new Date(order.createdAt);
      const amount = order.total || order.amount || 0;
      
      if (order.paymentStatus === 'Completed' || order.paymentStatus === 'Paid' || order.paymentConfirmed) {
        totalCredited += amount;
        if (orderDate >= todayStart) todayCredited += amount;
        if (orderDate >= weekStart) weekCredited += amount;
        if (orderDate >= monthStart) monthCredited += amount;
      } else if (order.paymentStatus === 'Pending' || order.paymentStatus === 'Awaiting Payment') {
        totalPending += amount;
      } else if (order.paymentStatus === 'Failed') {
        totalFailed += amount;
      }
    });
    
    res.json({
      success: true,
      stats: {
        totalCredited,
        totalPending,
        totalFailed,
        todayCredited,
        weekCredited,
        monthCredited,
        totalOrders: orders.length,
        confirmedOrders: orders.filter(o => o.paymentConfirmed || o.paymentStatus === 'Completed' || o.paymentStatus === 'Paid').length,
        pendingOrders: orders.filter(o => o.paymentStatus === 'Pending' || o.paymentStatus === 'Awaiting Payment').length,
        lastUpdated: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Get transaction stats error:', error);
    res.status(500).json({ success: false, error: 'Failed to get transaction stats' });
  }
});

/**
 * GET /api/payment/transactions
 * Get paginated transactions list (admin only)
 */
router.get('/transactions', authenticate, requireAdmin, (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const filter = req.query.filter || 'all';
    
    let orders = db.orders.findAll();
    
    // Filter by payment status
    if (filter !== 'all') {
      orders = orders.filter(order => {
        switch(filter) {
          case 'completed':
            return order.paymentStatus === 'Completed' || order.paymentStatus === 'Paid' || order.paymentConfirmed;
          case 'pending':
            return order.paymentStatus === 'Pending' || order.paymentStatus === 'Awaiting Payment';
          case 'failed':
            return order.paymentStatus === 'Failed';
          default:
            return true;
        }
      });
    }
    
    // Sort by date (newest first)
    orders.sort((a, b) => new Date(b.createdAt || b.orderDate) - new Date(a.createdAt || a.orderDate));
    
    // Calculate pagination
    const total = orders.length;
    const totalPages = Math.ceil(total / limit);
    const start = (page - 1) * limit;
    const paginatedOrders = orders.slice(start, start + limit);
    
    res.json({
      success: true,
      transactions: paginatedOrders,
      pagination: {
        page,
        limit,
        total,
        totalPages
      }
    });
  } catch (error) {
    console.error('Get transactions error:', error);
    res.status(500).json({ success: false, error: 'Failed to get transactions' });
  }
});

/**
 * POST /api/payment/record-transaction
 * Manually record a transaction (admin only)
 */
router.post('/record-transaction', authenticate, requireAdmin, (req, res) => {
  try {
    const { orderId, amount, transactionId, method, status, notes } = req.body;
    
    if (!orderId) {
      return res.status(400).json({ success: false, error: 'Order ID is required' });
    }
    
    // Find and update the order
    const order = db.orders.findById(orderId);
    if (!order) {
      return res.status(404).json({ success: false, error: 'Order not found' });
    }
    
    // Update order with payment details
    const updates = {
      paymentStatus: status || 'Completed',
      paymentConfirmed: status === 'Completed' || status === 'Paid',
      paymentMethod: method || order.paymentMethod,
      transactionId: transactionId || order.transactionId,
      paymentNotes: notes,
      paymentRecordedAt: new Date().toISOString(),
      paymentRecordedBy: req.user.id
    };
    
    const updatedOrder = db.orders.update(orderId, updates);
    
    // Add notification
    addNotification({
      type: 'payment',
      title: 'Payment Recorded',
      message: `Payment of ₹${amount || order.total} recorded for order ${orderId}`,
      link: '#orders',
      priority: 'medium'
    });
    
    res.json({ success: true, order: updatedOrder, message: 'Transaction recorded successfully' });
  } catch (error) {
    console.error('Record transaction error:', error);
    res.status(500).json({ success: false, error: 'Failed to record transaction' });
  }
});

/**
 * POST /api/payment/gateway-settings/reset
 * Reset payment settings to default (admin only)
 */
router.post('/gateway-settings/reset', authenticate, requireAdmin, (req, res) => {
  try {
    const defaultSettings = {
      gatewayMode: 'manual',
      manual: {
        upi: {
          enabled: true,
          upiId: '',
          displayName: 'BLACKONN',
          description: 'Pay using any UPI app'
        },
        bank: {
          enabled: false,
          accountName: '',
          accountNumber: '',
          ifscCode: '',
          bankName: '',
          branchName: ''
        },
        cod: {
          enabled: true,
          extraCharge: 40,
          minOrderValue: 0,
          maxOrderValue: 10000
        }
      },
      automatic: {
        selectedGateway: '',
        razorpay: {
          enabled: false,
          keyId: '',
          keySecret: '',
          webhookSecret: ''
        },
        payu: {
          merchantKey: '',
          salt: '',
          merchantId: ''
        },
        cashfree: {
          appId: '',
          secretKey: ''
        },
        phonepe: {
          merchantId: '',
          saltKey: '',
          saltIndex: '1'
        },
        paytm: {
          merchantId: '',
          merchantKey: '',
          website: ''
        },
        ccavenue: {
          merchantId: '',
          accessCode: '',
          workingKey: ''
        },
        instamojo: {
          apiKey: '',
          authToken: '',
          salt: ''
        },
        stripe: {
          publishableKey: '',
          secretKey: '',
          webhookSecret: ''
        },
        other: {
          enabled: false,
          gatewayName: '',
          merchantId: '',
          apiKey: '',
          apiSecret: '',
          webhookSecret: '',
          extraField1: '',
          extraField2: ''
        }
      },
      transactions: {
        totalCredited: 0,
        totalPending: 0,
        history: []
      },
      settings: {
        sendReceiptEmail: true,
        autoVerifyPayments: false,
        paymentReminderHours: 24,
        refundProcessingDays: 7
      },
      updatedAt: new Date().toISOString()
    };
    
    writePaymentSettings(defaultSettings);
    
    res.json({ success: true, settings: defaultSettings, message: 'Settings reset to default' });
  } catch (error) {
    console.error('Reset payment settings error:', error);
    res.status(500).json({ success: false, error: 'Failed to reset settings' });
  }
});

module.exports = router;
