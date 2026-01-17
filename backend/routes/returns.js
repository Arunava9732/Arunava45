/**
 * Return Requests Routes
 */

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../utils/database');const { addNotification } = require('../utils/adminNotificationStore');const { authenticate, requireAdmin } = require('../middleware/auth');
const { validators, validateRequest, returnLimiter } = require('../middleware/security');
const { body, param } = require('express-validator');
const { sendAdminNotification, formatReturnMessage } = require('../utils/whatsapp');
const { aiRequestLogger, aiPerformanceMonitor } = require('../middleware/aiEnhancer');

const router = express.Router();

// AI Middleware
router.use(aiRequestLogger);
router.use(aiPerformanceMonitor(500));

// Get all returns (admin)
router.get('/', authenticate, requireAdmin, (req, res) => {
  try {
    const returns = db.returns.findAll();
    
    // Sort by date (newest first)
    const sorted = returns.sort((a, b) => 
      new Date(b.createdAt) - new Date(a.createdAt)
    );

    res.json({ success: true, returns: sorted });
  } catch (error) {
    console.error('Get returns error:', error);
    res.status(500).json({ success: false, error: 'Failed to get returns' });
  }
});

// Get my returns
router.get('/my-returns', authenticate, (req, res) => {
  try {
    const returns = db.returns.findAll();
    const myReturns = returns.filter(r => r.userId === req.user.id);

    // Sort by date (newest first)
    const sorted = myReturns.sort((a, b) => 
      new Date(b.createdAt) - new Date(a.createdAt)
    );

    res.json({ success: true, returns: sorted });
  } catch (error) {
    console.error('Get my returns error:', error);
    res.status(500).json({ success: false, error: 'Failed to get returns' });
  }
});

// Get single return
router.get('/:id', authenticate, (req, res) => {
  try {
    const returnRequest = db.returns.findById(req.params.id);

    if (!returnRequest) {
      return res.status(404).json({ success: false, error: 'Return not found' });
    }

    // Check permission
    if (returnRequest.userId !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    res.json({ success: true, return: returnRequest });
  } catch (error) {
    console.error('Get return error:', error);
    res.status(500).json({ success: false, error: 'Failed to get return' });
  }
});

// Create return request - with input validation
router.post('/', 
  returnLimiter,
  authenticate,
  validateRequest([
    body('orderId').trim().notEmpty().withMessage('Order ID is required'),
    body('items').isArray({ min: 1 }).withMessage('At least one item is required'),
    body('reason').trim().notEmpty().isLength({ max: 500 }).withMessage('Reason is required (max 500 characters)'),
    body('description').optional().trim().isLength({ max: 2000 }).withMessage('Description too long (max 2000 characters)')
  ]),
  (req, res) => {
  try {
    const { orderId, items, reason, description } = req.body;

    // Verify order exists and belongs to user
    const order = db.orders.findById(orderId);
    if (!order) {
      return res.status(404).json({ success: false, error: 'Order not found' });
    }

    if (order.userId !== req.user.id && order.customerEmail !== req.user.email) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    // Check if order is eligible for return (must be Delivered)
    if (order.status !== 'Delivered') {
      return res.status(400).json({ 
        success: false, 
        error: 'This order is not eligible for return. Only delivered orders can be returned.' 
      });
    }

    // Check if a return has already been requested for this order
    if (order.returnId) {
      return res.status(400).json({ 
        success: false, 
        error: 'A return request has already been submitted for this order.' 
      });
    }

    // Check 7-day return window from delivery date
    const deliveryDate = order.deliveredAt ? new Date(order.deliveredAt) : (order.createdAt ? new Date(order.createdAt) : null);
    if (deliveryDate) {
      const now = new Date();
      const daysSinceDelivery = Math.floor((now - deliveryDate) / (1000 * 60 * 60 * 24));
      if (daysSinceDelivery > 7) {
        return res.status(400).json({ 
          success: false, 
          error: 'Return period has expired. Returns are only accepted within 7 days of delivery.' 
        });
      }
    }

    // Build return items from the provided items
    const returnItems = items.map(item => ({
      productId: item.productId || item.id,
      name: item.name,
      size: item.size,
      color: item.color,
      quantity: item.quantity || 1,
      price: item.price || 0,
      image: item.image
    }));

    const refundAmount = returnItems.reduce(
      (sum, item) => sum + (item.price * item.quantity), 
      0
    );

    const returnRequest = {
      id: `RET-${Date.now()}`,
      orderId,
      userId: req.user.id,
      items: returnItems,
      reason,
      description: description || '',
      status: 'Pending',
      refundAmount,
      requestedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    db.returns.create(returnRequest);

    // Add To Admin Notification Panel
    addNotification({
      type: 'return',
      title: 'Return Requested',
      message: `Return requested for Order #${orderId} - Reason: ${reason}`,
      priority: 'high',
      link: '#returns',
      data: { returnId: returnRequest.id, orderId }
    });

    console.log(`[AI-Enhanced] Return request created: ${returnRequest.id}, Order: ${orderId}, Refund: ₹${refundAmount}`);

    // Update order status to indicate return requested
    db.orders.update(orderId, { 
      status: 'Return Requested',
      returnId: returnRequest.id,
      updatedAt: new Date().toISOString()
    });

    // Send WhatsApp notification to admin
    sendAdminNotification(formatReturnMessage(returnRequest)).catch(err => console.error('WhatsApp notification failed:', err));

    res.status(201).json({ success: true, return: returnRequest });
  } catch (error) {
    console.error('Create return error:', error);
    res.status(500).json({ success: false, error: 'Failed to create return request' });
  }
});

// Update return status (admin)
router.patch('/:id/status', authenticate, requireAdmin, (req, res) => {
  try {
    const { status, adminNotes } = req.body;

    const validStatuses = ['Pending', 'Approved', 'Rejected', 'Pickup Scheduled', 'Picked Up', 'Processing', 'Refunded', 'Completed'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, error: 'Invalid status' });
    }

    const returnRequest = db.returns.findById(req.params.id);
    if (!returnRequest) {
      return res.status(404).json({ success: false, error: 'Return not found' });
    }

    const updates = {
      status,
      updatedAt: new Date().toISOString()
    };

    if (adminNotes) {
      updates.adminNotes = adminNotes;
    }

    // If approved, update stock
    if (status === 'Approved' && returnRequest.status !== 'Approved') {
      returnRequest.items.forEach(item => {
        const product = db.products.findById(item.productId);
        if (product) {
          db.products.update(item.productId, {
            stock: (product.stock || 0) + item.quantity
          });
        }
      });
    }

    // If refunded, mark as refunded
    if (status === 'Refunded') {
      updates.refundedAt = new Date().toISOString();
    }

    const updated = db.returns.update(req.params.id, updates);

    res.json({ success: true, return: updated });
  } catch (error) {
    console.error('Update return status error:', error);
    res.status(500).json({ success: false, error: 'Failed to update return' });
  }
});

// Delete return (admin only)
router.delete('/:id', authenticate, requireAdmin, (req, res) => {
  try {
    const returnRequest = db.returns.findById(req.params.id);
    if (!returnRequest) {
      return res.status(404).json({ success: false, error: 'Return not found' });
    }

    // Delete the return request
    const deleted = db.returns.delete(req.params.id);

    res.json({ success: true, message: 'Return request deleted successfully', deleted });
  } catch (error) {
    console.error('Delete return error:', error);
    res.status(500).json({ success: false, error: 'Failed to delete return' });
  }
});

// Get return stats (admin)
router.get('/stats/summary', authenticate, requireAdmin, (req, res) => {
  try {
    const returns = db.returns.findAll();

    const stats = {
      total: returns.length,
      pending: returns.filter(r => r.status === 'Pending').length,
      approved: returns.filter(r => r.status === 'Approved').length,
      rejected: returns.filter(r => r.status === 'Rejected').length,
      refunded: returns.filter(r => r.status === 'Refunded').length,
      totalRefundAmount: returns
        .filter(r => r.status === 'Refunded')
        .reduce((sum, r) => sum + (r.refundAmount || 0), 0)
    };

    res.json({ success: true, stats });
  } catch (error) {
    console.error('Get return stats error:', error);
    res.status(500).json({ success: false, error: 'Failed to get stats' });
  }
});

module.exports = router;
