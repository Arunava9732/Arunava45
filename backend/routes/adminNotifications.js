const express = require('express');
const router = express.Router();
const { authenticate, requireAdmin } = require('../middleware/auth');
const { 
  getNotifications, 
  markAsRead, 
  markAllAsRead, 
  deleteNotification,
  clearReadNotifications
} = require('../utils/adminNotificationStore');

// All routes here require admin authentication
router.use(authenticate, requireAdmin);

// Get all notifications
router.get('/', (req, res) => {
  try {
    const notifications = getNotifications();
    res.json({ success: true, notifications });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch notifications' });
  }
});

// Mark a notification as read
router.post('/:id/read', (req, res) => {
  try {
    markAsRead(req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to update notification' });
  }
});

// Mark all as read
router.post('/read-all', (req, res) => {
  try {
    markAllAsRead();
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to update notifications' });
  }
});

// Delete a notification
router.delete('/:id', (req, res) => {
  try {
    deleteNotification(req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to delete notification' });
  }
});

// Clear all read notifications
router.delete('/history/clear', (req, res) => {
  try {
    clearReadNotifications();
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to clear history' });
  }
});

module.exports = router;
