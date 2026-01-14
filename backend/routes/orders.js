/**
 * Orders Routes
 */

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../utils/database');
const { authenticate, isAdmin } = require('../middleware/auth');
const { validators, validateRequest, orderLimiter, returnLimiter } = require('../middleware/security');
const { body, param } = require('express-validator');
const { sendOrderConfirmation, sendLowStockAlert } = require('../utils/email');
const { sendAdminNotification, formatOrderMessage, formatLowStockMessage } = require('../utils/whatsapp');
const { notifyAdmins } = require('../utils/adminNotifier');
const { sendOrderWebhook } = require('../routes/webhooks');
const { aiRequestLogger, aiPerformanceMonitor } = require('../middleware/aiEnhancer');

const router = express.Router();

// AI Middleware
router.use(aiRequestLogger);
router.use(aiPerformanceMonitor(500));

// Get all orders (admin only)
router.get('/', authenticate, isAdmin, (req, res) => {
  try {
    const allOrders = db.orders.findAll();
    // Filter out orders that are awaiting payment confirmation (online payment not yet confirmed)
    // Show all orders to admin, but mark unconfirmed ones
    const orders = allOrders.filter(order => {
      // Show COD orders always
      if (order.paymentMethod === 'cod') return true;
      // Show orders where payment is confirmed
      if (order.paymentConfirmed === true) return true;
      // Show orders that are already marked as paid/completed
      const paymentStatus = (order.paymentStatus || '').toLowerCase();
      if (paymentStatus === 'completed' || paymentStatus === 'paid') return true;
      // Hide unconfirmed online payment orders (user cancelled or didn't pay)
      return false;
    });
    // Sort by date descending
    orders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
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
    // Also filter out orders that are awaiting payment confirmation
    const orders = allOrders.filter(order => {
      // First check if order belongs to this user
      const isUserOrder = order.userId === req.user.id || order.userEmail === req.user.email;
      if (!isUserOrder) return false;
      
      // Show COD orders always
      if (order.paymentMethod === 'cod') return true;
      // Show orders where payment is confirmed
      if (order.paymentConfirmed === true) return true;
      // Show orders that are already marked as paid/completed
      const paymentStatus = (order.paymentStatus || '').toLowerCase();
      if (paymentStatus === 'completed' || paymentStatus === 'paid') return true;
      // Hide unconfirmed online payment orders
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
    body('paymentMethod').optional().isIn(['cod', 'online', 'upi', 'card']).withMessage('Invalid payment method'),
    body('subtotal').isNumeric().withMessage('Invalid subtotal'),
    body('total').isNumeric().withMessage('Invalid total')
  ]),
  (req, res) => {
    try {
      const { items, shippingInfo, paymentMethod, subtotal, shipping, total } = req.body;

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
      const isCOD = paymentMethod === 'cod';
      const paymentConfirmed = isCOD; // Only COD orders are confirmed immediately
      
      const order = {
        id: 'ORD' + Date.now(),
        userId: req.user.id,
        userEmail: req.user.email,
        userName: req.user.name,
        items: enrichedItems,
        shippingInfo,
        paymentMethod: paymentMethod || 'cod',
        subtotal: Number(subtotal) || 0,
        shipping: Number(shipping) || 0,
        total: Number(total) || 0,
        status: isCOD ? 'Pending' : 'Awaiting Payment',
        paymentStatus: isCOD ? 'Pending' : 'Awaiting Payment',
        paymentConfirmed: paymentConfirmed,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      db.orders.create(order);
      
      console.log(`[AI-Enhanced] Order created: ${order.id}, User: ${req.user.id}, Total: ₹${order.total}`);
      
      // Only send notifications for confirmed orders (COD) - online payment orders will trigger on verification
      if (paymentConfirmed) {
        sendOrderWebhook && sendOrderWebhook('order.created', order);

        // Send Order Confirmation to User
        sendOrderConfirmation(order, req.user.email).catch(err => console.error('Order email failed:', err));

        // Unified Admin Notification
        notifyAdmins(
          `New Order: #${order.id.slice(-8).toUpperCase()}`,
          formatOrderMessage(order)
        ).catch(err => console.error('Admin notification failed:', err));

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
    if (paymentStatus) updates.paymentStatus = paymentStatus;

    const updated = db.orders.update(req.params.id, updates);

    console.log(`[AI-Enhanced] Order status updated: ${req.params.id}, Status: ${status || 'N/A'}, Payment: ${paymentStatus || 'N/A'}`);

    res.json({ success: true, order: updated });
  } catch (error) {
    console.error('Update order status error:', error);
    res.status(500).json({ success: false, error: 'Failed to update order' });
  }
});

// Verify payment for an order (order owner or admin)
router.post('/:id/verify-payment', authenticate, (req, res) => {
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

    // Update order with payment confirmed status
    const updates = { 
      paymentStatus: 'Completed', 
      paymentConfirmed: true,
      status: 'Confirmed',
      updatedAt: new Date().toISOString() 
    };

    const updated = db.orders.update(req.params.id, updates);
    
    // Now that payment is confirmed, send all notifications
    sendOrderWebhook && sendOrderWebhook('order.created', updated);
    
    // Send order confirmation email
    const userEmail = order.userEmail || (order.shippingInfo && order.shippingInfo.email);
    if (userEmail) {
      sendOrderConfirmation(updated, userEmail).catch(err => console.error('Order email failed:', err));
    }
    
    // Send WhatsApp notification to admin
    sendAdminNotification(formatOrderMessage(updated)).catch(err => console.error('WhatsApp notification failed:', err));
    
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

    res.json({ success: true, order: updated });
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

module.exports = router;
