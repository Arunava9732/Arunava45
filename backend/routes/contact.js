/**
 * Contact Messages Routes with Security
 * Includes auto-generated Query Numbers for tracking
 */

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');
const db = require('../utils/database');
const { authenticate, requireAdmin, optionalAuth } = require('../middleware/auth');
const { contactLimiter, validators } = require('../middleware/security');
const { sendContactNotification } = require('../utils/email');
const { sendAdminNotification, formatContactMessage } = require('../utils/whatsapp');
const { aiRequestLogger, aiPerformanceMonitor } = require('../middleware/aiEnhancer');
const { notifyAdmins } = require('../utils/adminNotifier');
const pythonBridge = require('../utils/python_bridge');

const router = express.Router();

// AI Middleware
router.use(aiRequestLogger);
router.use(aiPerformanceMonitor(500));

// Upload directory for contact attachments
const CONTACT_UPLOAD_DIR = path.join(__dirname, '..', 'uploads', 'contact');

// Query number counter file
const QUERY_COUNTER_FILE = path.join(__dirname, '..', 'data', 'queryCounter.json');

// Generate unique query number (format: QRY-YYYYMMDD-XXXX)
function generateQueryNumber() {
  try {
    // Get current date in YYYYMMDD format
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
    
    // Read or initialize counter
    let counterData = { date: '', count: 0 };
    if (fs.existsSync(QUERY_COUNTER_FILE)) {
      try {
        counterData = JSON.parse(fs.readFileSync(QUERY_COUNTER_FILE, 'utf8'));
      } catch (e) {
        console.error('Error reading query counter:', e);
      }
    }
    
    // Reset counter if it's a new day
    if (counterData.date !== dateStr) {
      counterData = { date: dateStr, count: 0 };
    }
    
    // Increment counter
    counterData.count += 1;
    
    // Save updated counter
    fs.writeFileSync(QUERY_COUNTER_FILE, JSON.stringify(counterData, null, 2));
    
    // Format: QRY-20240115-0001
    const queryNumber = `QRY-${dateStr}-${String(counterData.count).padStart(4, '0')}`;
    return queryNumber;
  } catch (error) {
    console.error('Error generating query number:', error);
    // Fallback: use timestamp-based number
    return `QRY-${Date.now()}`;
  }
}

// Helper to delete uploaded file
function deleteUploadedFile(filePath) {
  try {
    if (!filePath) return;
    
    // Extract filename from URL path
    let filename = filePath;
    if (filePath.includes('/uploads/contact/')) {
      filename = filePath.split('/uploads/contact/').pop();
    } else if (filePath.includes('/api/uploads/contact/')) {
      filename = filePath.split('/api/uploads/contact/').pop();
    }
    
    const fullPath = path.join(CONTACT_UPLOAD_DIR, filename);
    
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
      console.log('Deleted contact file:', fullPath);
    }
  } catch (error) {
    console.error('Error deleting contact file:', error);
  }
}

// Get all contact messages (admin) - supports search by query number
router.get('/', authenticate, requireAdmin, (req, res) => {
  try {
    let messages = db.contacts.findAll();
    
    // Search by query number if provided
    const { query, queryNumber, search } = req.query;
    const searchTerm = query || queryNumber || search;
    
    if (searchTerm) {
      const term = searchTerm.toLowerCase().trim();
      messages = messages.filter(m => 
        (m.queryNumber && m.queryNumber.toLowerCase().includes(term)) ||
        (m.name && m.name.toLowerCase().includes(term)) ||
        (m.email && m.email.toLowerCase().includes(term)) ||
        (m.subject && m.subject.toLowerCase().includes(term))
      );
    }
    
    // Sort by date (newest first)
    const sorted = messages.sort((a, b) => 
      new Date(b.createdAt) - new Date(a.createdAt)
    );

    res.json({ success: true, messages: sorted });
  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({ success: false, error: 'Failed to get messages' });
  }
});

// Search by query number (public - for customers to track their queries)
router.get('/track/:queryNumber', (req, res) => {
  try {
    const { queryNumber } = req.params;
    
    if (!queryNumber) {
      return res.status(400).json({ success: false, error: 'Query number is required' });
    }
    
    const messages = db.contacts.findAll();
    const message = messages.find(m => 
      m.queryNumber && m.queryNumber.toLowerCase() === queryNumber.toLowerCase()
    );
    
    if (!message) {
      return res.status(404).json({ 
        success: false, 
        error: 'No query found with this number' 
      });
    }
    
    // Return limited info for public tracking (no full message content)
    res.json({
      success: true,
      query: {
        queryNumber: message.queryNumber,
        subject: message.subject,
        status: message.status || (message.replied ? 'solved' : 'pending'),
        createdAt: message.createdAt,
        replied: message.replied || false,
        repliedAt: message.repliedAt || null
      }
    });
  } catch (error) {
    console.error('Track query error:', error);
    res.status(500).json({ success: false, error: 'Failed to track query' });
  }
});

// Get single message (admin)
router.get('/:id', authenticate, requireAdmin, (req, res) => {
  try {
    const message = db.contacts.findById(req.params.id);

    if (!message) {
      return res.status(404).json({ success: false, error: 'Message not found' });
    }

    // Mark as read
    if (!message.read) {
      db.contacts.update(req.params.id, { 
        read: true,
        readAt: new Date().toISOString()
      });
    }

    res.json({ success: true, message });
  } catch (error) {
    console.error('Get message error:', error);
    res.status(500).json({ success: false, error: 'Failed to get message' });
  }
});

// Submit contact form (public) - with rate limiting
router.post('/', 
  contactLimiter,
  optionalAuth,
  async (req, res) => {
  try {
    const { name, email, phone, subject, message } = req.body;

    if (!name || !email || !message) {
      return res.status(400).json({ 
        success: false, 
        error: 'Name, email, and message are required' 
      });
    }

    // Validate inputs
    if (!validators.isValidEmail(email)) {
      return res.status(400).json({ success: false, error: 'Invalid email format' });
    }

    if (!validators.isValidName(name)) {
      return res.status(400).json({ success: false, error: 'Invalid name format' });
    }

    if (message.length > 5000) {
      return res.status(400).json({ success: false, error: 'Message too long (max 5000 characters)' });
    }

    const contactMessage = {
      id: uuidv4(),
      queryNumber: generateQueryNumber(), // Auto-generated tracking number
      name: name.trim(),
      email: email.toLowerCase().trim(),
      phone: phone || '',
      subject: subject || 'General Inquiry',
      message: message.trim(),
      attachments: req.body.attachments || [],
      userId: req.user?.id || null,
      read: false,
      replied: false,
      status: 'pending', // pending, open, solved
      createdAt: new Date().toISOString()
    };

    // AI Sentiment Analysis using Python Bridge
    try {
      const aiAnalysis = await pythonBridge.runPythonScript('ai_hub.py', ['emotion/sentiment', JSON.stringify({ text: message })]);
      contactMessage.aiSentiment = aiAnalysis.sentiment;
      contactMessage.aiSentimentScore = aiAnalysis.score;
      contactMessage.isUrgent = aiAnalysis.urgent;
    } catch (e) {
      console.error('[AI-Sentiment] Python analysis failed:', e.message);
      contactMessage.aiSentiment = 'unknown';
    }

    db.contacts.create(contactMessage);

    console.log(`[AI-Enhanced] Contact message created: ${contactMessage.id}, Query: ${contactMessage.queryNumber}, Sentiment: ${contactMessage.aiSentiment}`);

    // Unified Admin Notification - add urgency flag if detected
    const urgencyPrefix = contactMessage.isUrgent ? '[URGENT] ' : '';
    notifyAdmins(
      `${urgencyPrefix}New Customer Query: ${contactMessage.queryNumber}`,
      `Query #: ${contactMessage.queryNumber}\nUrgency: ${contactMessage.isUrgent ? 'High' : 'Normal'}\nSentiment: ${contactMessage.aiSentiment}\nName: ${contactMessage.name}\nEmail: ${contactMessage.email}\nSubject: ${contactMessage.subject}\n\nMessage:\n${contactMessage.message}`
    ).catch(err => console.error('Admin notification failed:', err));

    res.status(201).json({ 
      success: true, 
      message: 'Message sent successfully',
      id: contactMessage.id,
      queryNumber: contactMessage.queryNumber
    });
  } catch (error) {
    console.error('Submit contact error:', error);
    res.status(500).json({ success: false, error: 'Failed to send message' });
  }
});

// Reply to message (admin)
router.post('/:id/reply', authenticate, requireAdmin, (req, res) => {
  try {
    const { reply } = req.body;

    if (!reply) {
      return res.status(400).json({ success: false, error: 'Reply is required' });
    }

    const message = db.contacts.findById(req.params.id);
    if (!message) {
      return res.status(404).json({ success: false, error: 'Message not found' });
    }

    const replies = message.replies || [];
    replies.push({
      id: uuidv4(),
      text: reply,
      adminId: req.user.id,
      createdAt: new Date().toISOString()
    });

    const updated = db.contacts.update(req.params.id, {
      replies,
      replied: true,
      repliedAt: new Date().toISOString()
    });

    // In a real app, you would send an email to the customer here

    res.json({ success: true, message: updated });
  } catch (error) {
    console.error('Reply to message error:', error);
    res.status(500).json({ success: false, error: 'Failed to send reply' });
  }
});

// Mark as read/unread (admin)
router.patch('/:id/read', authenticate, requireAdmin, (req, res) => {
  try {
    const { read } = req.body;

    const message = db.contacts.findById(req.params.id);
    if (!message) {
      return res.status(404).json({ success: false, error: 'Message not found' });
    }

    const updated = db.contacts.update(req.params.id, {
      read: read !== false,
      readAt: read !== false ? new Date().toISOString() : null
    });

    res.json({ success: true, message: updated });
  } catch (error) {
    console.error('Mark message error:', error);
    res.status(500).json({ success: false, error: 'Failed to update message' });
  }
});

// Mark as solved/unsolved (admin)
router.patch('/:id/status', authenticate, requireAdmin, (req, res) => {
  try {
    const { status } = req.body;

    if (!['pending', 'open', 'solved'].includes(status)) {
      return res.status(400).json({ success: false, error: 'Invalid status. Must be pending, open, or solved' });
    }

    const message = db.contacts.findById(req.params.id);
    if (!message) {
      return res.status(404).json({ success: false, error: 'Message not found' });
    }

    const updated = db.contacts.update(req.params.id, {
      status,
      statusUpdatedAt: new Date().toISOString()
    });

    res.json({ success: true, message: updated });
  } catch (error) {
    console.error('Update status error:', error);
    res.status(500).json({ success: false, error: 'Failed to update status' });
  }
});

// Delete message (admin)
router.delete('/:id', authenticate, requireAdmin, (req, res) => {
  try {
    const message = db.contacts.findById(req.params.id);
    if (!message) {
      return res.status(404).json({ success: false, error: 'Message not found' });
    }

    // Delete attachments if any
    if (message.attachments && Array.isArray(message.attachments)) {
      message.attachments.forEach(attachment => deleteUploadedFile(attachment));
    }
    
    // Also check replies for attachments
    if (message.replies && Array.isArray(message.replies)) {
      message.replies.forEach(reply => {
        if (reply.attachments && Array.isArray(reply.attachments)) {
          reply.attachments.forEach(attachment => deleteUploadedFile(attachment));
        }
      });
    }

    db.contacts.delete(req.params.id);

    res.json({ success: true, message: 'Message deleted' });
  } catch (error) {
    console.error('Delete message error:', error);
    res.status(500).json({ success: false, error: 'Failed to delete message' });
  }
});

// Get unread count (admin)
router.get('/stats/unread', authenticate, requireAdmin, (req, res) => {
  try {
    const messages = db.contacts.findAll();
    const unread = messages.filter(m => !m.read).length;

    res.json({ success: true, unread });
  } catch (error) {
    console.error('Get unread count error:', error);
    res.status(500).json({ success: false, error: 'Failed to get count' });
  }
});

// Get user's own messages/queries
router.get('/mine/list', authenticate, (req, res) => {
  try {
    const messages = db.contacts.findAll();
    
    // Filter by user ID or email
    const userMessages = messages.filter(m => 
      m.userId === req.user.id || m.email === req.user.email
    );
    
    // Sort by date (newest first)
    const sorted = userMessages.sort((a, b) => 
      new Date(b.createdAt) - new Date(a.createdAt)
    );

    res.json({ success: true, messages: sorted });
  } catch (error) {
    console.error('Get user messages error:', error);
    res.status(500).json({ success: false, error: 'Failed to get messages' });
  }
});

// User follow-up reply to their own query
router.post('/mine/:id/reply', authenticate, (req, res) => {
  try {
    const { reply, attachments } = req.body;

    if (!reply || !reply.trim()) {
      return res.status(400).json({ success: false, error: 'Reply message is required' });
    }

    if (reply.length > 2000) {
      return res.status(400).json({ success: false, error: 'Reply too long (max 2000 characters)' });
    }

    const message = db.contacts.findById(req.params.id);
    if (!message) {
      return res.status(404).json({ success: false, error: 'Query not found' });
    }

    // Verify the query belongs to this user
    if (message.userId !== req.user.id && message.email !== req.user.email) {
      return res.status(403).json({ success: false, error: 'Not authorized to reply to this query' });
    }

    // Check if query is closed/solved - prevent replies
    if (message.status === 'solved') {
      return res.status(400).json({ success: false, error: 'This query has been closed. You cannot reply to closed queries.' });
    }

    // Add user reply to the replies array
    const replies = message.replies || [];
    replies.push({
      id: uuidv4(),
      text: reply.trim(),
      attachments: attachments || [],
      userId: req.user.id,
      userName: req.user.name || 'User',
      isUserReply: true,
      createdAt: new Date().toISOString()
    });

    // Update the message - mark as unread so admin sees the new reply, set status to open
    const updated = db.contacts.update(req.params.id, {
      replies,
      read: false,
      status: 'open',
      userRepliedAt: new Date().toISOString()
    });

    res.json({ success: true, message: updated });
  } catch (error) {
    console.error('User reply error:', error);
    res.status(500).json({ success: false, error: 'Failed to send reply' });
  }
});

module.exports = router;
