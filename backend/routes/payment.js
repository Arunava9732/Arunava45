/**
 * Payment Routes - Razorpay Integration
 * Handles payment gateway operations
 * 
 * Razorpay will only be active if RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET 
 * are configured in environment variables
 */

const express = require('express');
const crypto = require('crypto');
const { authenticate, optionalAuth } = require('../middleware/auth');
const db = require('../utils/database');
const { sendOrderConfirmation, sendLowStockAlert } = require('../utils/email');
const { sendAdminNotification, formatOrderMessage, formatLowStockMessage } = require('../utils/whatsapp');
const { addNotification } = require('../utils/adminNotificationStore');
const { sendOrderWebhook } = require('./webhooks');
const { aiRequestLogger, aiPerformanceMonitor } = require('../middleware/aiEnhancer');
const { payment: paymentAI, health: healthAI } = require('../utils/python_bridge');

const router = express.Router();

// AI Middleware
router.use(aiRequestLogger);
router.use(aiPerformanceMonitor(500));

// Razorpay configuration
const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID;
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;

// Check if Razorpay is configured
const isRazorpayConfigured = () => {
  return !!(RAZORPAY_KEY_ID && RAZORPAY_KEY_SECRET);
};

// Initialize Razorpay instance only if configured
let razorpay = null;
if (isRazorpayConfigured()) {
  try {
    const Razorpay = require('razorpay');
    razorpay = new Razorpay({
      key_id: RAZORPAY_KEY_ID,
      key_secret: RAZORPAY_KEY_SECRET
    });
    console.log('✅ Razorpay payment gateway initialized');
  } catch (error) {
    console.log('⚠️ Razorpay SDK not installed. Run: npm install razorpay');
  }
}

/**
 * GET /api/payment/mode
 * Ultra-fast endpoint to check payment mode (< 50ms response)
 * Returns: { mode: 'razorpay' | 'manual', keyId?: string }
 */
router.get('/mode', (req, res) => {
  const razorpayEnabled = isRazorpayConfigured() && razorpay !== null;
  res.json({
    mode: razorpayEnabled ? 'razorpay' : 'manual',
    keyId: razorpayEnabled ? RAZORPAY_KEY_ID : null
  });
});

/**
 * GET /api/payment/config
 * Get payment gateway configuration (public)
 * Returns whether Razorpay is enabled and the key_id for frontend
 */
router.get('/config', (req, res) => {
  try {
    const razorpayEnabled = isRazorpayConfigured() && razorpay !== null;
    
    res.json({
      success: true,
      razorpayEnabled: razorpayEnabled,
      keyId: razorpayEnabled ? RAZORPAY_KEY_ID : null,
      // Available payment methods when Razorpay is enabled
      paymentMethods: razorpayEnabled ? {
        card: true,
        upi: true,
        netbanking: true,
        wallet: true,
        emi: false // Can be enabled based on business need
      } : {
        upi: true, // Default UPI payment (manual)
        card: false,
        netbanking: false,
        wallet: false
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
    // Check if Razorpay is configured
    if (!isRazorpayConfigured() || !razorpay) {
      return res.status(400).json({ 
        success: false, 
        error: 'Razorpay payment gateway is not configured' 
      });
    }

    const { amount, currency = 'INR', orderId, receipt, notes = {} } = req.body;

    // Validate amount
    if (!amount || amount <= 0) {
      return res.status(400).json({ success: false, error: 'Invalid amount' });
    }

    // Amount should be in paise (smallest currency unit)
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
      order: {
        id: razorpayOrder.id,
        amount: razorpayOrder.amount,
        currency: razorpayOrder.currency,
        receipt: razorpayOrder.receipt
      },
      keyId: RAZORPAY_KEY_ID
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
    // Check if Razorpay is configured
    if (!isRazorpayConfigured()) {
      return res.status(400).json({ 
        success: false, 
        error: 'Razorpay payment gateway is not configured' 
      });
    }

    const { 
      razorpay_order_id, 
      razorpay_payment_id, 
      razorpay_signature,
      orderId // Our internal order ID
    } = req.body;

    // Validate required fields
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing payment verification data' 
      });
    }

    // Verify signature
    const body = razorpay_order_id + '|' + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac('sha256', RAZORPAY_KEY_SECRET)
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

        // Send WhatsApp notification to admin
        sendAdminNotification(formatOrderMessage(updatedOrder)).catch(err => 
          console.error('WhatsApp notification failed:', err)
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
    // Check if Razorpay is configured
    if (!isRazorpayConfigured() || !razorpay) {
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
    // Check if Razorpay is configured
    if (!isRazorpayConfigured() || !razorpay) {
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

    // Check if Razorpay is configured
    if (!isRazorpayConfigured() || !razorpay) {
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

module.exports = router;
