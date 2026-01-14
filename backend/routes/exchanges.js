/**
 * Exchange Requests Routes
 */

const express = require('express');
const db = require('../utils/database');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { validateRequest, returnLimiter } = require('../middleware/security');
const { body } = require('express-validator');
const { sendAdminNotification } = require('../utils/whatsapp');
const { aiRequestLogger, aiPerformanceMonitor } = require('../middleware/aiEnhancer');

const router = express.Router();

// AI Middleware
router.use(aiRequestLogger);
router.use(aiPerformanceMonitor(500));

// Format exchange message for WhatsApp
function formatExchangeMessage(exchange) {
  return `🔄 *New Exchange Request*\n\nExchange ID: ${exchange.id}\nOrder ID: ${exchange.orderId}\nReason: ${exchange.reason}\nItems: ${exchange.items?.length || 0}\nRequested: ${new Date(exchange.createdAt).toLocaleString()}`;
}

// Get all exchanges (admin)
router.get('/', authenticate, requireAdmin, (req, res) => {
  try {
    const exchanges = db.exchanges ? db.exchanges.findAll() : [];
    
    // Sort by date (newest first)
    const sorted = exchanges.sort((a, b) => 
      new Date(b.createdAt) - new Date(a.createdAt)
    );

    res.json({ success: true, exchanges: sorted });
  } catch (error) {
    console.error('Get exchanges error:', error);
    res.status(500).json({ success: false, error: 'Failed to get exchanges' });
  }
});

// Get my exchanges
router.get('/my-exchanges', authenticate, (req, res) => {
  try {
    const exchanges = db.exchanges ? db.exchanges.findAll() : [];
    const myExchanges = exchanges.filter(e => e.userId === req.user.id);

    // Sort by date (newest first)
    const sorted = myExchanges.sort((a, b) => 
      new Date(b.createdAt) - new Date(a.createdAt)
    );

    res.json({ success: true, exchanges: sorted });
  } catch (error) {
    console.error('Get my exchanges error:', error);
    res.status(500).json({ success: false, error: 'Failed to get exchanges' });
  }
});

// Get single exchange
router.get('/:id', authenticate, (req, res) => {
  try {
    const exchange = db.exchanges ? db.exchanges.findById(req.params.id) : null;

    if (!exchange) {
      return res.status(404).json({ success: false, error: 'Exchange not found' });
    }

    // Check permission
    if (exchange.userId !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    res.json({ success: true, exchange });
  } catch (error) {
    console.error('Get exchange error:', error);
    res.status(500).json({ success: false, error: 'Failed to get exchange' });
  }
});

// Create exchange request
router.post('/', 
  returnLimiter,
  authenticate,
  validateRequest([
    body('orderId').trim().notEmpty().withMessage('Order ID is required'),
    body('items').isArray({ min: 1 }).withMessage('At least one item is required'),
    body('reason').trim().notEmpty().isLength({ max: 500 }).withMessage('Reason is required (max 500 characters)'),
    body('exchangeFor').trim().notEmpty().withMessage('Exchange preference is required'),
    body('description').optional().trim().isLength({ max: 2000 }).withMessage('Description too long (max 2000 characters)')
  ]),
  (req, res) => {
  try {
    const { orderId, items, reason, exchangeFor, description } = req.body;

    // Verify order exists and belongs to user
    const order = db.orders.findById(orderId);
    if (!order) {
      return res.status(404).json({ success: false, error: 'Order not found' });
    }

    if (order.userId !== req.user.id && order.customerEmail !== req.user.email) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    // Check if order is eligible for exchange (must be Delivered and within 2 days)
    if (order.status !== 'Delivered') {
      return res.status(400).json({ 
        success: false, 
        error: 'This order is not eligible for exchange. Only delivered orders can be exchanged.' 
      });
    }

    // Check if an exchange has already been requested for this order
    if (order.exchangeId) {
      return res.status(400).json({ 
        success: false, 
        error: 'An exchange request has already been submitted for this order.' 
      });
    }

    // Check 2-day exchange window from delivery date
    const deliveryDate = order.deliveredAt ? new Date(order.deliveredAt) : (order.createdAt ? new Date(order.createdAt) : null);
    if (deliveryDate) {
      const now = new Date();
      const daysSinceDelivery = Math.floor((now - deliveryDate) / (1000 * 60 * 60 * 24));
      if (daysSinceDelivery > 2) {
        return res.status(400).json({ 
          success: false, 
          error: 'Exchange period has expired. Exchanges are only accepted within 2 days of delivery.' 
        });
      }
    }

    // Build exchange items
    const exchangeItems = items.map(item => ({
      productId: item.productId || item.id,
      name: item.name,
      size: item.size,
      color: item.color,
      quantity: item.quantity || 1,
      price: item.price || 0,
      image: item.image,
      newSize: item.newSize || item.size,
      newColor: item.newColor || item.color
    }));

    const exchangeRequest = {
      id: `EXC-${Date.now()}`,
      orderId,
      userId: req.user.id,
      userName: req.user.name || '',
      userEmail: req.user.email || '',
      items: exchangeItems,
      reason,
      exchangeFor,
      description: description || '',
      status: 'Pending',
      requestedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    if (db.exchanges) {
      db.exchanges.create(exchangeRequest);
    }

    console.log(`[AI-Enhanced] Exchange request created: ${exchangeRequest.id}, Order: ${orderId}`);

    // Update order status
    db.orders.update(orderId, { 
      status: 'Exchange Requested',
      exchangeId: exchangeRequest.id,
      updatedAt: new Date().toISOString()
    });

    // Send WhatsApp notification to admin
    sendAdminNotification(formatExchangeMessage(exchangeRequest)).catch(err => console.error('WhatsApp notification failed:', err));

    res.status(201).json({ success: true, exchange: exchangeRequest });
  } catch (error) {
    console.error('Create exchange error:', error);
    res.status(500).json({ success: false, error: 'Failed to create exchange request' });
  }
});

// Update exchange status (admin)
router.patch('/:id/status', authenticate, requireAdmin, (req, res) => {
  try {
    const { status, adminNotes } = req.body;

    const validStatuses = ['Pending', 'Approved', 'Rejected', 'Pickup Scheduled', 'Picked Up', 'Processing', 'Shipped', 'Completed'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, error: 'Invalid status' });
    }

    const exchange = db.exchanges ? db.exchanges.findById(req.params.id) : null;
    if (!exchange) {
      return res.status(404).json({ success: false, error: 'Exchange not found' });
    }

    const updates = {
      status,
      updatedAt: new Date().toISOString()
    };

    if (adminNotes) {
      updates.adminNotes = adminNotes;
    }

    console.log(`[AI-Enhanced] Exchange status updated: ${req.params.id}, Status: ${status}`);

    if (status === 'Completed') {
      updates.completedAt = new Date().toISOString();
    }

    const updated = db.exchanges.update(req.params.id, updates);

    res.json({ success: true, exchange: updated });
  } catch (error) {
    console.error('Update exchange status error:', error);
    res.status(500).json({ success: false, error: 'Failed to update exchange' });
  }
});

// Delete exchange (admin only)
router.delete('/:id', authenticate, requireAdmin, (req, res) => {
  try {
    const exchange = db.exchanges ? db.exchanges.findById(req.params.id) : null;
    if (!exchange) {
      return res.status(404).json({ success: false, error: 'Exchange not found' });
    }

    const deleted = db.exchanges.delete(req.params.id);

    res.json({ success: true, message: 'Exchange request deleted successfully', deleted });
  } catch (error) {
    console.error('Delete exchange error:', error);
    res.status(500).json({ success: false, error: 'Failed to delete exchange' });
  }
});

// Get exchange stats (admin)
router.get('/stats/summary', authenticate, requireAdmin, (req, res) => {
  try {
    const exchanges = db.exchanges ? db.exchanges.findAll() : [];

    const stats = {
      total: exchanges.length,
      pending: exchanges.filter(e => e.status === 'Pending').length,
      approved: exchanges.filter(e => e.status === 'Approved').length,
      rejected: exchanges.filter(e => e.status === 'Rejected').length,
      completed: exchanges.filter(e => e.status === 'Completed').length
    };

    res.json({ success: true, stats });
  } catch (error) {
    console.error('Get exchange stats error:', error);
    res.status(500).json({ success: false, error: 'Failed to get stats' });
  }
});

module.exports = router;
