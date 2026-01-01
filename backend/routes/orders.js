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
const { sendOrderWebhook } = require('../routes/webhooks');

const router = express.Router();

// Get all orders (admin only)
router.get('/', authenticate, isAdmin, (req, res) => {
  try {
    const orders = db.orders.findAll();
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
    const orders = allOrders.filter(order => 
      order.userId === req.user.id || order.userEmail === req.user.email
    );
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
        status: 'Pending',
        paymentStatus: paymentMethod === 'cod' ? 'Pending' : 'Awaiting Payment',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      db.orders.create(order);
      sendOrderWebhook && sendOrderWebhook('order.created', order);

      // Send order confirmation email
      sendOrderConfirmation(order, req.user.email).catch(err => console.error('Order email failed:', err));

      // Send WhatsApp notification to admin
      sendAdminNotification(formatOrderMessage(order)).catch(err => console.error('WhatsApp notification failed:', err));

      // Update product stock
      items.forEach(item => {
        const product = db.products.findById(item.id);
        if (product) {
          const newStock = Math.max(0, (product.stock || 0) - (item.quantity || 1));
          db.products.update(item.id, {
            stock: newStock
          });

          // Trigger low stock alert if stock falls below 5
          if (newStock <= 5) {
            sendLowStockAlert({ ...product, stock: newStock }).catch(err => console.error('Low stock alert failed:', err));
            sendAdminNotification(formatLowStockMessage({ ...product, stock: newStock })).catch(err => console.error('WhatsApp low stock alert failed:', err));
          }
        }
      });

      // Clear user's cart
      const carts = db.carts.findAll();
      if (typeof carts === 'object') {
        delete carts[req.user.id];
        db.carts.replaceAll(carts);
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

    // If already completed/paid, return current
    const currentStatus = (order.paymentStatus || '').toLowerCase();
    if (currentStatus === 'completed' || currentStatus === 'paid') {
      return res.json({ success: true, order });
    }

    const updates = { paymentStatus: 'Completed', updatedAt: new Date().toISOString() };
    // If order was awaiting payment, optionally mark as Confirmed
    if (!order.status || order.status === 'Pending' || order.status === 'Awaiting Payment') {
      updates.status = 'Confirmed';
    }

    const updated = db.orders.update(req.params.id, updates);
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

    const updated = db.orders.update(req.params.id, {
      status: 'Cancelled',
      cancelledAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    // Restore product stock
    order.items.forEach(item => {
      const product = db.products.findById(item.id);
      if (product) {
        db.products.update(item.id, {
          stock: (product.stock || 0) + (item.quantity || 1)
        });
      }
    });

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
    const orders = db.orders.findAll();
    
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
