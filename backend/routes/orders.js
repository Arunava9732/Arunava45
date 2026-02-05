/**
 * Orders Routes
 */

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');
const db = require('../utils/database');
const { authenticate, isAdmin } = require('../middleware/auth');
const { validators, validateRequest, orderLimiter, returnLimiter } = require('../middleware/security');
const { body, param } = require('express-validator');
const { 
  sendOrderConfirmation, 
  sendLowStockAlert, 
  sendGiftCardEmail,
  sendNewOrderAdmin
} = require('../utils/email');
const { 
  sendAdminNotification, 
  formatOrderMessage, 
  formatLowStockMessage,
  sendOrderConfirmationToUser
} = require('../utils/whatsapp');
const { notifyAdmins } = require('../utils/adminNotifier');
const { addNotification } = require('../utils/adminNotificationStore');
const { sendOrderWebhook } = require('../routes/webhooks');
const { aiRequestLogger, aiPerformanceMonitor } = require('../middleware/aiEnhancer');

// Gift Card helper functions for order processing
const GIFT_CARDS_FILE = path.join(__dirname, '..', 'data', 'giftCards.json');

function readGiftCardData() {
  try {
    if (!fs.existsSync(GIFT_CARDS_FILE)) return { giftCards: [], transactions: [] };
    const data = JSON.parse(fs.readFileSync(GIFT_CARDS_FILE, 'utf-8'));
    return {
      giftCards: data.giftCards || [],
      transactions: data.transactions || [],
      settings: data.settings || { enabled: true, minAmount: 100, maxAmount: 50000, defaultExpiryDays: 365 }
    };
  } catch (e) {
    return { giftCards: [], transactions: [], settings: { enabled: true, defaultExpiryDays: 365 } };
  }
}

function writeGiftCardData(data) {
  fs.writeFileSync(GIFT_CARDS_FILE, JSON.stringify(data, null, 2));
}

function generateGiftCardCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'BLK-';
  for (let i = 0; i < 4; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
  code += '-';
  for (let i = 0; i < 4; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
  return code;
}

async function processGiftCardItems(order) {
  if (!order.items || !Array.isArray(order.items)) return;
  
  const giftCardItems = order.items.filter(item => item.type === 'gift-card' || (item.id && String(item.id).startsWith('gc_')));
  if (giftCardItems.length === 0) return;
  
  console.log(`[Order Processing] Processing ${giftCardItems.length} gift cards for Order ${order.id}`);
  const gcData = readGiftCardData();
  
  for (const item of giftCardItems) {
    const code = generateGiftCardCode();
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + (gcData.settings?.defaultExpiryDays || 365));
    
    // Determine user email
    const customerEmail = order.userEmail || (order.customer && order.customer.email) || (order.shippingInfo && order.shippingInfo.email);
    
    const newCard = {
      id: 'GC-' + uuidv4(),
      code: code,
      value: item.price,
      balance: item.price,
      status: 'active',
      recipientName: item.recipientName || 'Valued Customer',
      recipientEmail: item.recipientEmail || customerEmail,
      senderName: order.userName || (order.customer && order.customer.name) || 'BLACKONN Store',
      message: item.message || '',
      orderId: order.id,
      purchasedBy: order.userId,
      purchasedAt: new Date().toISOString(),
      expiresAt: expiryDate.toISOString(),
      createdAt: new Date().toISOString()
    };
    
    gcData.giftCards.push(newCard);
    
    // Record transaction
    gcData.transactions.push({
      id: 'tx_p_' + uuidv4(),
      giftCardId: newCard.id,
      type: 'purchase',
      amount: item.price,
      userId: order.userId,
      date: new Date().toISOString(),
      details: `Purchased in Order #${order.id}`
    });
    
    // Send email to recipient
    try {
      if (newCard.recipientEmail) {
        await sendGiftCardEmail(newCard, newCard.recipientEmail, newCard.senderName);
        console.log(`[Order Processing] Gift card email sent to ${newCard.recipientEmail}`);
      }
    } catch (err) {
      console.error(`[Order Processing] Failed to send gift card email:`, err);
    }
  }
  
  writeGiftCardData(gcData);
  console.log(`[Order Processing] Successfully generated ${giftCardItems.length} gift cards`);
}

const router = express.Router();

// AI-OPTIMIZED: Disable caching for all orders data
router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  next();
});

// AI Middleware
router.use(aiRequestLogger);
router.use(aiPerformanceMonitor(500));

// Get all orders (admin only)
router.get('/', authenticate, isAdmin, (req, res) => {
  try {
    const allOrders = db.orders.findAll();
    // Show all orders to admin, including unconfirmed ones
    const orders = [...allOrders];
    
    // Sort by date descending
    orders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.json({ success: true, orders });
  } catch (error) {
    console.error('Get orders error:', error);
    res.status(500).json({ success: false, error: 'Failed to get orders' });
  }
});

// Get user's orders
router.get('/my-orders', authenticate, (req, res) => {
  try {
    const allOrders = db.orders.findAll();
    // Filter by userId OR userEmail to catch all user's orders
    const orders = allOrders.filter(order => {
      // First check if order belongs to this user
      const isUserOrder = (order.userId && order.userId === req.user.id) || 
                         (order.userEmail && order.userEmail === req.user.email);
      
      if (!isUserOrder) return false;
      
      // AI-REFINED: Show nearly all stages of the order process for transparency
      // 1. Show COD orders always
      if (order.paymentMethod === 'cod') return true;
      
      // 2. Show orders where payment is confirmed or verification is pending
      if (order.paymentConfirmed === true) return true;
      if (order.paymentStatus === 'Verification Pending') return true;
      
      // 3. Show orders that are already marked as paid/completed/shipped
      const paymentStatus = (order.paymentStatus || '').toLowerCase();
      if (['completed', 'paid', 'verified'].includes(paymentStatus)) return true;
      
      const orderStatus = (order.status || '').toLowerCase();
      if (['confirmed', 'processing', 'shipped', 'delivered', 'return requested', 'exchange requested'].includes(orderStatus)) return true;

      // Only hide orders that are explicitly 'unpaid' and haven't requested verification
      return false;
    });
    
    orders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.json({ success: true, orders });
  } catch (error) {
    console.error('Get user orders error:', error);
    res.status(500).json({ success: false, error: 'Failed to get orders' });
  }
});

// Get order by ID
router.get('/:id', authenticate, (req, res) => {
  try {
    const order = db.orders.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ success: false, error: 'Order not found' });
    }

    // Check authorization
    if (req.user.role !== 'admin' && order.userId !== req.user.id) {
      return res.status(403).json({ success: false, error: 'Not authorized' });
    }

    res.json({ success: true, order });
  } catch (error) {
    console.error('Get order error:', error);
    res.status(500).json({ success: false, error: 'Failed to get order' });
  }
});

// Create order - with input validation
router.post('/', 
  orderLimiter,
  authenticate,
  validateRequest([
    body('items').isArray({ min: 1 }).withMessage('Cart cannot be empty'),
    body('shippingInfo.name').trim().notEmpty().withMessage('Shipping name is required'),
    body('shippingInfo.address').trim().notEmpty().withMessage('Shipping address is required'),
    body('shippingInfo.city').optional().trim().escape(),
    body('shippingInfo.state').optional().trim().escape(),
    body('shippingInfo.pincode').optional().trim().escape(),
    body('shippingInfo.phone').optional().trim(),
    body('paymentMethod').optional().isIn(['cod', 'online', 'upi', 'card', 'other']).withMessage('Invalid payment method'),
    body('subtotal').isNumeric().withMessage('Invalid subtotal'),
    body('total').isNumeric().withMessage('Invalid total')
  ]),
  (req, res) => {
    try {
      const { items, shippingInfo, paymentMethod, paymentDetails, subtotal, shipping, discount, promoCode, promoType, total } = req.body;

      // Enhanced Gift Card Validation & Redemption
      if (promoType === 'giftcard' && promoCode) {
        try {
          const giftCardsPath = path.join(__dirname, '..', 'data', 'giftCards.json');
          if (fs.existsSync(giftCardsPath)) {
            const gcData = JSON.parse(fs.readFileSync(giftCardsPath, 'utf8'));
            const cardIndex = gcData.giftCards.findIndex(c => c.code.toUpperCase() === promoCode.toUpperCase());
            
            if (cardIndex === -1) {
              return res.status(400).json({ success: false, error: 'Invalid gift card code' });
            }
            
            const card = gcData.giftCards[cardIndex];
            const redeemAmount = Number(discount) || 0;
            const userId = req.user.id;
            
            // Ownership Check: If card is claimed by someone else, block use.
            if (card.claimedBy && card.claimedBy !== userId) {
              return res.status(400).json({ success: false, error: 'This gift card is linked to another account' });
            }
            
            // Check One-Time Use & Status
            if (card.status !== 'active' || (card.balance !== undefined && card.balance <= 0)) {
              return res.status(400).json({ success: false, error: 'This gift card has already been redeemed or is no longer active' });
            }

            // Check if expired
            if (card.expiresAt && new Date(card.expiresAt) < new Date()) {
              return res.status(400).json({ success: false, error: 'Gift card has expired' });
            }

            // Ensure balance is sufficient for the requested discount
            if (card.balance < redeemAmount) {
              return res.status(400).json({ success: false, error: 'Insufficient gift card balance' });
            }
            
            // MULTI-USE REDEMPTION: Deduct only used balance, keep active if balance remains
            const originalBalance = card.balance;
            card.balance -= redeemAmount;
            
            if (card.balance <= 0) {
              card.balance = 0;
              card.status = 'redeemed';
            } else {
              card.status = 'active';
            }

            card.claimedBy = userId; 
            card.lastUsedAt = new Date().toISOString();
            
            // Record detailed transaction
            gcData.transactions.push({
              id: 'tx_ord_' + uuidv4(),
              giftCardId: card.id,
              type: 'redeem',
              amount: redeemAmount,
              remainingBalance: card.balance,
              userId: userId,
              date: new Date().toISOString(),
              details: `Partial redemption for Order (ORD${Date.now()})`
            });
            
            fs.writeFileSync(giftCardsPath, JSON.stringify(gcData, null, 2));
            console.log(`[GiftCard] Multi-use redemption for ${promoCode} by user ${req.user.email}. Remaining: ₹${card.balance}`);
          } else {
            return res.status(400).json({ success: false, error: 'Gift card system offline' });
          }
        } catch (gcErr) {
          console.error('Critical error in gift card redemption flow:', gcErr);
          return res.status(500).json({ success: false, error: 'Gift card processing failed' });
        }
      }

      // Additional validation for item structure
      for (const item of items) {
        if (!item.id || typeof item.id !== 'string') {
          return res.status(400).json({ success: false, error: 'Invalid item ID' });
        }
        if (!item.quantity || item.quantity < 1) {
          return res.status(400).json({ success: false, error: 'Invalid item quantity' });
        }
      }

      // Enrich items with product data (image, current name, etc.)
      const enrichedItems = items.map(item => {
        const product = db.products.findById(item.id) || db.products.findById(item.productId);
        return {
          ...item,
          name: item.name || (product && product.name) || 'Product',
          image: item.image || item.thumbImage || (product && (product.image || (product.thumbImages && product.thumbImages[0]))) || '',
          productId: item.productId || item.id || (product && product.id)
        };
      });

      // For COD orders, payment is confirmed immediately (will be collected on delivery)
      // For online payments (UPI, card, etc.), payment needs to be verified before order is confirmed
      // For 'other' (manual) payments, we set to 'Verification Pending' for AI/Interval auto-verify
      const isCOD = paymentMethod === 'cod';
      const isOther = paymentMethod === 'other';
      const paymentConfirmed = isCOD;
      
      const order = {
        id: 'ORD' + Date.now(),
        userId: req.user.id,
        userEmail: req.user.email,
        userName: req.user.name,
        items: enrichedItems,
        shippingInfo,
        paymentMethod: paymentMethod || 'cod',
        paymentDetails: paymentDetails || {},
        transactionId: isCOD ? 'COD-' + Date.now() : (isOther ? (paymentDetails?.transactionId || 'MANUAL-' + Date.now()) : null),
        subtotal: Number(subtotal) || 0,
        shipping: Number(shipping) || 0,
        discount: Number(discount) || 0,
        promoCode: promoCode || null,
        promoType: promoType || null,
        total: Number(total) || 0,
        status: isCOD ? 'Pending' : (isOther ? 'Verification Pending' : 'Awaiting Payment'),
        paymentStatus: isCOD ? 'Pending' : (isOther ? 'Verification Pending' : 'Awaiting Payment'),
        paymentConfirmed: paymentConfirmed,
        verificationRequestedAt: isOther ? new Date().toISOString() : null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      db.orders.create(order);
      
        // Add to Admin Notification Panel
        addNotification({
          type: 'order',
          title: 'New Order Received',
          message: `Order #${order.id} for ₹${order.total.toLocaleString()} from ${req.user.name || order.userEmail}`,
          priority: order.total > 5000 ? 'high' : 'medium',
          link: '#orders',
          data: { orderId: order.id }
        });

      // Only send notifications for confirmed orders (COD) - online payment orders will trigger on verification
      if (paymentConfirmed) {
        sendOrderWebhook && sendOrderWebhook('order.created', order);

        // Send Order Confirmation to User
        sendOrderConfirmation(order, req.user.email).catch(err => console.error('Order email failed:', err));
        
        // Send WhatsApp Order Confirmation to User
        const userPhone = order.shippingInfo?.phone || req.user.phone;
        if (userPhone) {
          sendOrderConfirmationToUser(userPhone, order).catch(err => 
            console.error('WhatsApp order confirmation failed:', err.message)
          );
        }

        // Send Notification to Admin
        sendNewOrderAdmin(order).catch(err => console.error('Admin order email failed:', err));

        // Unified Admin Notification
        notifyAdmins(
          `New Order: #${order.id.slice(-8).toUpperCase()}`,
          formatOrderMessage(order)
        ).catch(err => console.error('Admin notification failed:', err));

        // Process any purchased gift cards in the order
        processGiftCardItems(order).catch(err => console.error('Gift card processing failed:', err));

        // Update product stock only for confirmed orders (COD)
        items.forEach(item => {
          const product = db.products.findById(item.id);
          if (product) {
            const newStock = Math.max(0, (product.stock || 0) - (item.quantity || 1));
            db.products.update(item.id, {
              stock: newStock
            });

            // Trigger low stock alert if stock falls below 5
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

              notifyAdmins(
                `Low Stock Alert: ${product.name}`,
                formatLowStockMessage({ ...product, stock: newStock })
              ).catch(err => console.error('Low stock admin notification failed:', err));
            }
          }
        });

        // Clear user's cart only for confirmed orders
        const carts = db.carts.findAll();
        if (typeof carts === 'object') {
          delete carts[req.user.id];
          db.carts.replaceAll(carts);
        }
      }

      res.status(201).json({ success: true, order });
    } catch (error) {
      console.error('Create order error:', error);
      res.status(500).json({ success: false, error: 'Failed to create order' });
    }
});

// Update order status (admin only)
router.patch('/:id/status', authenticate, isAdmin, (req, res) => {
  try {
    const { status, paymentStatus } = req.body;

    const order = db.orders.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ success: false, error: 'Order not found' });
    }

    const updates = { updatedAt: new Date().toISOString() };
    if (status) updates.status = status;

    // Check if we are marking it as paid now
    const isBecomingPaid = (paymentStatus === 'Completed' || paymentStatus === 'Paid') && 
                          !order.paymentConfirmed && 
                          order.paymentStatus !== 'Completed' && 
                          order.paymentStatus !== 'Paid';

    if (paymentStatus) {
      updates.paymentStatus = paymentStatus;
      if (paymentStatus === 'Completed' || paymentStatus === 'Paid') {
        updates.paymentConfirmed = true;
        // If it was awaiting payment, also update main status to Confirmed
        if (order.status === 'Awaiting Payment' || order.status === 'Pending') {
          updates.status = 'Confirmed';
        }
      }
    }

    const updated = db.orders.update(req.params.id, updates);

    // Automatically create shipment record if marked as Shipped
    if (status === 'Shipped') {
      try {
        const shippingDataPath = path.join(__dirname, '..', 'data', 'shipping.json');
        if (fs.existsSync(shippingDataPath)) {
          const sData = JSON.parse(fs.readFileSync(shippingDataPath, 'utf8'));
          // Check if shipment already exists
          const existing = sData.shipments.find(s => s.orderId === req.params.id || s.referenceId === req.params.id);
          if (!existing) {
            const newShipment = {
              id: uuidv4(),
              referenceId: req.params.id,
              referenceType: 'order',
              orderId: req.params.id,
              courier: 'default',
              trackingNumber: 'BLK' + Date.now().toString(36).toUpperCase(),
              trackingMode: 'manual',
              status: 'shipped',
              statusHistory: [
                { status: 'created', timestamp: new Date().toISOString(), note: 'Shipment auto-created on status change' },
                { status: 'shipped', timestamp: new Date().toISOString(), note: 'Item marked as Shipped by Admin' }
              ],
              createdAt: new Date().toISOString()
            };
            sData.shipments.push(newShipment);
            fs.writeFileSync(shippingDataPath, JSON.stringify(sData, null, 2));
            console.log(`[Shipping] Auto-created shipment for Order ${req.params.id}`);
          }
        }
      } catch (err) {
        console.error('[Shipping] Failed to auto-create shipment:', err);
      }
    }

    // If transitions to paid, trigger side effects (stock, emails, etc.)
    if (isBecomingPaid) {
      console.log(`[Admin] Order ${req.params.id} manually verified as PAID.`);
      
      // Trigger side effects
      sendOrderWebhook && sendOrderWebhook('order.created', updated);
      
      const userEmail = updated.userEmail || (updated.shippingInfo && updated.shippingInfo.email);
      if (userEmail) {
        sendOrderConfirmation(updated, userEmail).catch(err => console.error('Order email failed:', err));
        sendNewOrderAdmin(updated).catch(err => console.error('Admin order email failed:', err));
      }
      
      sendAdminNotification(formatOrderMessage(updated)).catch(err => console.error('WhatsApp notification failed:', err));
      
      // Process any purchased gift cards in the order
      processGiftCardItems(updated).catch(err => console.error('Gift card processing failed:', err));
      
      // Deduct stock
      if (updated.items && Array.isArray(updated.items)) {
        updated.items.forEach(item => {
          const productId = item.id || item.productId;
          const product = db.products.findById(productId);
          if (product) {
            const newStock = Math.max(0, (product.stock || 0) - (item.quantity || 1));
            db.products.update(productId, { stock: newStock });
            if (newStock <= 5) {
              notifyAdmins(`Low Stock Alert: ${product.name}`, formatLowStockMessage({ ...product, stock: newStock }))
                .catch(err => console.error('Low stock alert failed:', err));
            }
          }
        });
      }
    }

    console.log(`[AI-Enhanced] Order status updated: ${req.params.id}, Status: ${updates.status || 'N/A'}, Payment: ${paymentStatus || 'N/A'}`);

    res.json({ success: true, order: updated });
  } catch (error) {
    console.error('Update order status error:', error);
    res.status(500).json({ success: false, error: 'Failed to update order' });
  }
});

/**
 * Helper function to verify payment and process order side effects
 */
async function performOrderVerification(orderId) {
  try {
    const order = db.orders.findById(orderId);
    if (!order) return { success: false, error: 'Order not found' };

    // Update order with payment confirmed status
    const updates = { 
      paymentStatus: 'Completed', 
      paymentConfirmed: true,
      status: 'Confirmed',
      updatedAt: new Date().toISOString() 
    };

    const updated = db.orders.update(orderId, updates);
    
    // Now that payment is confirmed, send all notifications
    if (typeof sendOrderWebhook === 'function') {
      sendOrderWebhook('order.created', updated);
    }
    
    // Send order confirmation email
    const userEmail = order.userEmail || (order.shippingInfo && order.shippingInfo.email);
    if (userEmail) {
      sendOrderConfirmation(updated, userEmail).catch(err => console.error('Order email failed:', err));
      sendNewOrderAdmin(updated).catch(err => console.error('Admin order email failed:', err));
    }
    
    // Send WhatsApp notification to admin
    sendAdminNotification(formatOrderMessage(updated)).catch(err => console.error('WhatsApp notification failed:', err));
    
    // Process any purchased gift cards in the order
    processGiftCardItems(updated).catch(err => console.error('Gift card processing failed:', err));
    
    // Update product stock now that payment is confirmed
    if (order.items && Array.isArray(order.items)) {
      order.items.forEach(item => {
        const productId = item.id || item.productId;
        const product = db.products.findById(productId);
        if (product) {
          const newStock = Math.max(0, (product.stock || 0) - (item.quantity || 1));
          db.products.update(productId, {
            stock: newStock
          });

          // Trigger low stock alert if stock falls below 5
          if (newStock <= 5) {
            notifyAdmins(
              `Low Stock Alert: ${product.name}`,
              formatLowStockMessage({ ...product, stock: newStock })
            ).catch(err => console.error('Low stock admin notification failed:', err));
          }
        }
      });
    }
    
    // Clear user's cart after successful payment
    const carts = db.carts.findAll();
    if (typeof carts === 'object' && order.userId) {
      delete carts[order.userId];
      db.carts.replaceAll(carts);
    }

    return { success: true, order: updated };
  } catch (error) {
    console.error('Order verification helper error:', error);
    return { success: false, error: error.message };
  }
}

// Verify payment for an order (order owner or admin)
router.post('/:id/verify-payment', authenticate, async (req, res) => {
  try {
    const order = db.orders.findById(req.params.id);
    if (!order) return res.status(404).json({ success: false, error: 'Order not found' });

    // Only owner or admin may verify payment
    if (req.user.role !== 'admin' && order.userId !== req.user.id) {
      return res.status(403).json({ success: false, error: 'Not authorized' });
    }

    // If already confirmed/paid, return current order
    if (order.paymentConfirmed === true) {
      return res.json({ success: true, order, message: 'Payment already confirmed' });
    }
    const currentStatus = (order.paymentStatus || '').toLowerCase();
    if (currentStatus === 'completed' || currentStatus === 'paid') {
      return res.json({ success: true, order, message: 'Payment already completed' });
    }

    const verificationResult = await performOrderVerification(req.params.id);
    
    if (verificationResult.success) {
      res.json({ success: true, order: verificationResult.order });
    } else {
      res.status(500).json({ success: false, error: verificationResult.error });
    }
  } catch (error) {
    console.error('Verify payment error:', error);
    res.status(500).json({ success: false, error: 'Failed to verify payment' });
  }
});

// Cancel order
router.post('/:id/cancel', authenticate, (req, res) => {
  try {
    const order = db.orders.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ success: false, error: 'Order not found' });
    }

    // Check authorization
    if (req.user.role !== 'admin' && order.userId !== req.user.id) {
      return res.status(403).json({ success: false, error: 'Not authorized' });
    }

    // Check if order can be cancelled
    if (['Shipped', 'Delivered', 'Cancelled'].includes(order.status)) {
      return res.status(400).json({ success: false, error: 'Order cannot be cancelled' });
    }

    // If payment was never confirmed (online payment that wasn't completed), delete the order entirely
    if (order.paymentConfirmed !== true && order.paymentMethod !== 'cod') {
      db.orders.delete(req.params.id);
      return res.json({ success: true, message: 'Unpaid order removed successfully', deleted: true });
    }

    // For confirmed orders (COD or paid online), mark as cancelled and restore stock
    const updated = db.orders.update(req.params.id, {
      status: 'Cancelled',
      cancelledAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    // Restore product stock only if payment was confirmed (stock was deducted)
    if (order.paymentConfirmed === true || order.paymentMethod === 'cod') {
      order.items.forEach(item => {
        const productId = item.id || item.productId;
        const product = db.products.findById(productId);
        if (product) {
          db.products.update(productId, {
            stock: (product.stock || 0) + (item.quantity || 1)
          });
        }
      });
    }

    res.json({ success: true, order: updated });
  } catch (error) {
    console.error('Cancel order error:', error);
    res.status(500).json({ success: false, error: 'Failed to cancel order' });
  }
});

// Delete order (admin only)
router.delete('/:id', authenticate, isAdmin, (req, res) => {
  try {
    const order = db.orders.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ success: false, error: 'Order not found' });
    }

    // Delete the order
    const deleted = db.orders.delete(req.params.id);

    res.json({ success: true, message: 'Order deleted successfully', deleted });
  } catch (error) {
    console.error('Delete order error:', error);
    res.status(500).json({ success: false, error: 'Failed to delete order' });
  }
});

// Get order stats (admin only)
router.get('/stats/summary', authenticate, isAdmin, (req, res) => {
  try {
    const allOrders = db.orders.findAll();
    
    // Filter to only include confirmed orders (same logic as listing)
    const orders = allOrders.filter(order => {
      if (order.paymentMethod === 'cod') return true;
      if (order.paymentConfirmed === true) return true;
      const paymentStatus = (order.paymentStatus || '').toLowerCase();
      if (paymentStatus === 'completed' || paymentStatus === 'paid') return true;
      return false;
    });
    
    const stats = {
      totalOrders: orders.length,
      totalSales: orders.reduce((sum, o) => sum + (o.total || 0), 0),
      pendingOrders: orders.filter(o => o.status === 'Pending').length,
      processingOrders: orders.filter(o => o.status === 'Processing').length,
      shippedOrders: orders.filter(o => o.status === 'Shipped').length,
      deliveredOrders: orders.filter(o => o.status === 'Delivered').length,
      cancelledOrders: orders.filter(o => o.status === 'Cancelled').length
    };

    res.json({ success: true, stats });
  } catch (error) {
    console.error('Get order stats error:', error);
    res.status(500).json({ success: false, error: 'Failed to get stats' });
  }
});

/**
 * AUTO-VERIFICATION FOR MANUAL PAYMENTS
 * Automatically verifies manual payments if admin doesn't act within 1 minute
 */
setInterval(async () => {
  try {
    const allOrders = db.orders.findAll();
    const now = new Date();
    const oneMinuteAgo = new Date(now.getTime() - 60000);
    
    // Find orders waiting for verification for more than 1 minute
    const pendingOrders = allOrders.filter(order => 
      order.paymentStatus === 'Verification Pending' && 
      !order.paymentConfirmed &&
      order.verificationRequestedAt &&
      new Date(order.verificationRequestedAt) < oneMinuteAgo
    );
    
    if (pendingOrders.length > 0) {
      console.log(`[Auto-Verify] Found ${pendingOrders.length} manual payments overdue for verification.`);
      
      for (const order of pendingOrders) {
        console.log(`[Auto-Verify] Automatically verifying Order #${order.id}...`);
        await performOrderVerification(order.id);
        
        // Add log entry
        addNotification({
          type: 'payment',
          title: 'Auto-Verification Triggered',
          message: `Order #${order.id} was automatically verified after 1-minute timeout.`,
          priority: 'low',
          link: '#orders'
        });
      }
    }
  } catch (err) {
    console.error('[Auto-Verify] Error in background verification task:', err);
  }
}, 30000); // Run every 30 seconds

module.exports = router;
