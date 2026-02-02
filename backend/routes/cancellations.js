/**
 * Cancellation Requests Routes
 */

const express = require('express');
const db = require('../utils/database');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { validateRequest, returnLimiter } = require('../middleware/security');
const { body } = require('express-validator');
const { sendAdminNotification } = require('../utils/whatsapp');
const { addNotification } = require('../utils/adminNotificationStore');
const { aiRequestLogger, aiPerformanceMonitor } = require('../middleware/aiEnhancer');

const router = express.Router();

// AI Middleware
router.use(aiRequestLogger);
router.use(aiPerformanceMonitor(500));

// Format cancellation message for WhatsApp
function formatCancellationMessage(cancellation) {
  return `❌ *New Cancellation Request*\n\nCancellation ID: ${cancellation.id}\nOrder ID: ${cancellation.orderId}\nReason: ${cancellation.reason}\nRefund Amount: ₹${cancellation.refundAmount || 0}\nRequested: ${new Date(cancellation.createdAt).toLocaleString()}`;
}

// Get all cancellations (admin)
router.get('/', authenticate, requireAdmin, (req, res) => {
  try {
    const cancellations = db.cancellations ? db.cancellations.findAll() : [];
    
    // Sort by date (newest first)
    const sorted = cancellations.sort((a, b) => 
      new Date(b.createdAt) - new Date(a.createdAt)
    );

    res.json({ success: true, cancellations: sorted });
  } catch (error) {
    console.error('Get cancellations error:', error);
    res.status(500).json({ success: false, error: 'Failed to get cancellations' });
  }
});

// Get my cancellations
router.get('/my-cancellations', authenticate, (req, res) => {
  try {
    const cancellations = db.cancellations ? db.cancellations.findAll() : [];
    const myCancellations = cancellations.filter(c => c.userId === req.user.id);

    // Sort by date (newest first)
    const sorted = myCancellations.sort((a, b) => 
      new Date(b.createdAt) - new Date(a.createdAt)
    );

    res.json({ success: true, cancellations: sorted });
  } catch (error) {
    console.error('Get my cancellations error:', error);
    res.status(500).json({ success: false, error: 'Failed to get cancellations' });
  }
});

// Get single cancellation
router.get('/:id', authenticate, (req, res) => {
  try {
    const cancellation = db.cancellations ? db.cancellations.findById(req.params.id) : null;

    if (!cancellation) {
      return res.status(404).json({ success: false, error: 'Cancellation not found' });
    }

    // Check permission
    if (cancellation.userId !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    res.json({ success: true, cancellation });
  } catch (error) {
    console.error('Get cancellation error:', error);
    res.status(500).json({ success: false, error: 'Failed to get cancellation' });
  }
});

// Create cancellation request
router.post('/', 
  returnLimiter,
  authenticate,
  validateRequest([
    body('orderId').trim().notEmpty().withMessage('Order ID is required'),
    body('reason').trim().notEmpty().isLength({ max: 500 }).withMessage('Reason is required (max 500 characters)'),
    body('description').optional().trim().isLength({ max: 2000 }).withMessage('Description too long (max 2000 characters)')
  ]),
  (req, res) => {
  try {
    const { orderId, reason, description } = req.body;

    // Verify order exists and belongs to user
    const order = db.orders.findById(orderId);
    if (!order) {
      return res.status(404).json({ success: false, error: 'Order not found' });
    }

    if (order.userId !== req.user.id && order.customerEmail !== req.user.email) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    // Check if order is eligible for cancellation (not shipped or delivered)
    const nonCancellableStatuses = ['Shipped', 'Delivered', 'Cancelled', 'Return Requested', 'Exchange Requested'];
    if (nonCancellableStatuses.includes(order.status)) {
      return res.status(400).json({ 
        success: false, 
        error: 'This order cannot be cancelled. It may have already been shipped or delivered.' 
      });
    }

    const refundAmount = order.total || 0;

    // Auto-approve cancellation for orders not yet shipped (no admin approval needed)
    const autoApprove = !['Shipped', 'Delivered'].includes(order.status);

    const cancellationRequest = {
      id: `CAN-${Date.now()}`,
      orderId,
      userId: req.user.id,
      userName: req.user.name || '',
      userEmail: req.user.email || '',
      items: order.items || [],
      reason,
      description: description || '',
      status: autoApprove ? 'Approved' : 'Pending',
      refundAmount,
      paymentMethod: order.paymentMethod || 'unknown',
      requestedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    if (autoApprove) {
      cancellationRequest.approvedAt = new Date().toISOString();
      cancellationRequest.autoApproved = true;
    }

    if (db.cancellations) {
      db.cancellations.create(cancellationRequest);
    }

    // Add To Admin Notification Panel
    addNotification({
      type: 'cancellation',
      title: 'Cancellation Requested',
      message: `Cancellation requested for Order #${orderId} - Reason: ${reason}`,
      priority: 'high',
      link: '#cancellations',
      data: { cancellationId: cancellationRequest.id, orderId }
    });

    console.log(`[AI-Enhanced] Cancellation request created: ${cancellationRequest.id}, Order: ${orderId}, Auto-approved: ${autoApprove}`);

    // If auto-approved, cancel order and restore stock immediately
    if (autoApprove) {
      // Restore stock for each item
      if (order.items && Array.isArray(order.items)) {
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
      // Update order status to Cancelled
      db.orders.update(orderId, { 
        status: 'Cancelled',
        cancellationId: cancellationRequest.id,
        cancelledAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
    } else {
      // Update order status to Cancellation Requested (requires admin approval)
      db.orders.update(orderId, { 
        status: 'Cancellation Requested',
        cancellationId: cancellationRequest.id,
        updatedAt: new Date().toISOString()
      });
    }

    // Send WhatsApp notification to admin
    sendAdminNotification(formatCancellationMessage(cancellationRequest)).catch(err => console.error('WhatsApp notification failed:', err));

    res.status(201).json({ success: true, cancellation: cancellationRequest });
  } catch (error) {
    console.error('Create cancellation error:', error);
    res.status(500).json({ success: false, error: 'Failed to create cancellation request' });
  }
});

// Update cancellation status (admin)
router.patch('/:id/status', authenticate, requireAdmin, (req, res) => {
  try {
    const { status, adminNotes } = req.body;

    const validStatuses = ['Pending', 'Approved', 'Rejected', 'Refund Processing', 'Refunded', 'Completed'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, error: 'Invalid status' });
    }

    const cancellation = db.cancellations ? db.cancellations.findById(req.params.id) : null;
    if (!cancellation) {
      return res.status(404).json({ success: false, error: 'Cancellation not found' });
    }

    const updates = {
      status,
      updatedAt: new Date().toISOString()
    };

    if (adminNotes) {
      updates.adminNotes = adminNotes;
    }

    console.log(`[AI-Enhanced] Cancellation status updated: ${req.params.id}, Status: ${status}`);

    // If approved, cancel the order and restore stock
    if (status === 'Approved' && cancellation.status !== 'Approved') {
      const order = db.orders.findById(cancellation.orderId);
      if (order) {
        // Restore stock
        if (order.items && Array.isArray(order.items)) {
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
        // Update order status to Cancelled
        db.orders.update(cancellation.orderId, {
          status: 'Cancelled',
          cancelledAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
      }
    }

    if (status === 'Refunded') {
      updates.refundedAt = new Date().toISOString();
    }

    if (status === 'Completed') {
      updates.completedAt = new Date().toISOString();
    }

    const updated = db.cancellations.update(req.params.id, updates);

    res.json({ success: true, cancellation: updated });
  } catch (error) {
    console.error('Update cancellation status error:', error);
    res.status(500).json({ success: false, error: 'Failed to update cancellation' });
  }
});

// Delete cancellation (admin only)
router.delete('/:id', authenticate, requireAdmin, (req, res) => {
  try {
    const cancellation = db.cancellations ? db.cancellations.findById(req.params.id) : null;
    if (!cancellation) {
      return res.status(404).json({ success: false, error: 'Cancellation not found' });
    }

    const deleted = db.cancellations.delete(req.params.id);

    res.json({ success: true, message: 'Cancellation request deleted successfully', deleted });
  } catch (error) {
    console.error('Delete cancellation error:', error);
    res.status(500).json({ success: false, error: 'Failed to delete cancellation' });
  }
});

// Get cancellation stats (admin)
router.get('/stats/summary', authenticate, requireAdmin, (req, res) => {
  try {
    const cancellations = db.cancellations ? db.cancellations.findAll() : [];

    const stats = {
      total: cancellations.length,
      pending: cancellations.filter(c => c.status === 'Pending').length,
      approved: cancellations.filter(c => c.status === 'Approved').length,
      rejected: cancellations.filter(c => c.status === 'Rejected').length,
      refunded: cancellations.filter(c => c.status === 'Refunded').length,
      totalRefundAmount: cancellations
        .filter(c => c.status === 'Refunded' || c.status === 'Completed')
        .reduce((sum, c) => sum + (c.refundAmount || 0), 0)
    };

    res.json({ success: true, stats });
  } catch (error) {
    console.error('Get cancellation stats error:', error);
    res.status(500).json({ success: false, error: 'Failed to get stats' });
  }
});

module.exports = router;
