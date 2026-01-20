/**
 * Gift Cards Routes
 * Create, manage, and redeem gift cards
 */

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');
const { authenticate, requireAdmin, optionalAuth } = require('../middleware/auth');
const { aiRequestLogger, aiPerformanceMonitor } = require('../middleware/aiEnhancer');
const { sendGiftCardEmail } = require('../utils/email');
const { addNotification } = require('../utils/adminNotificationStore');

const router = express.Router();

// AI Middleware
router.use(aiRequestLogger);
router.use(aiPerformanceMonitor(500));

// Data file path
const DATA_DIR = path.join(__dirname, '..', 'data');
const GIFT_CARDS_FILE = path.join(DATA_DIR, 'giftCards.json');

// Ensure data file exists
function ensureDataFile() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(GIFT_CARDS_FILE)) {
    const defaultData = {
      giftCards: [],
      transactions: [],
      settings: {
        enabled: true,
        minAmount: 100,
        maxAmount: 50000,
        defaultExpiryDays: 365
      }
    };
    fs.writeFileSync(GIFT_CARDS_FILE, JSON.stringify(defaultData, null, 2));
  }
}

function readData() {
  ensureDataFile();
  try {
    return JSON.parse(fs.readFileSync(GIFT_CARDS_FILE, 'utf-8'));
  } catch (e) {
    return { giftCards: [], transactions: [], settings: { enabled: true, minAmount: 100, maxAmount: 50000, defaultExpiryDays: 365 } };
  }
}

function writeData(data) {
  ensureDataFile();
  fs.writeFileSync(GIFT_CARDS_FILE, JSON.stringify(data, null, 2));
}

// Generate gift card code
function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'BLK-';
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  code += '-';
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// ============================================
// PUBLIC ROUTES
// ============================================

// Check gift card balance
router.get('/balance/:code', async (req, res) => {
  try {
    const { code } = req.params;
    const data = readData();
    
    const card = data.giftCards.find(c => c.code.toUpperCase() === code.toUpperCase());
    
    if (!card) {
      return res.status(404).json({ success: false, error: 'Gift card not found' });
    }
    
    // Check if expired
    if (new Date(card.expiresAt) < new Date()) {
      return res.json({
        success: true,
        balance: 0,
        originalValue: card.value,
        status: 'expired',
        expiresAt: card.expiresAt,
        message: 'This gift card has expired'
      });
    }
    
    res.json({
      success: true,
      balance: card.balance,
      originalValue: card.value,
      status: card.status,
      expiresAt: card.expiresAt
    });
  } catch (error) {
    console.error('Error checking gift card balance:', error);
    res.status(500).json({ success: false, error: 'Failed to check balance' });
  }
});

// Purchase gift card (public, but requires payment)
router.post('/purchase', optionalAuth, async (req, res) => {
  try {
    const { value, recipientName, recipientEmail, senderName, senderEmail, message } = req.body;
    
    const data = readData();
    
    // Validate amount
    const amount = parseInt(value);
    if (!amount || amount < data.settings.minAmount || amount > data.settings.maxAmount) {
      return res.status(400).json({
        success: false,
        error: `Gift card value must be between ₹${data.settings.minAmount} and ₹${data.settings.maxAmount}`
      });
    }
    
    // Validate required fields
    if (!recipientEmail || !senderEmail) {
      return res.status(400).json({ success: false, error: 'Email addresses are required' });
    }
    
    // Generate unique code
    let code;
    do {
      code = generateCode();
    } while (data.giftCards.some(c => c.code === code));
    
    // Calculate expiry
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + data.settings.defaultExpiryDays);
    
    const giftCard = {
      id: 'gc_' + uuidv4(),
      code: code,
      value: amount,
      balance: amount,
      status: 'active',
      recipientName: recipientName || '',
      recipientEmail: recipientEmail,
      senderName: senderName || 'A Friend',
      senderEmail: senderEmail,
      message: message || '',
      purchasedBy: req.user ? req.user.id : null,
      createdAt: new Date().toISOString(),
      expiresAt: expiresAt.toISOString()
    };
    
    data.giftCards.push(giftCard);
    
    // Record transaction
    data.transactions.push({
      id: 'tx_' + uuidv4(),
      giftCardId: giftCard.id,
      type: 'purchase',
      amount: amount,
      date: new Date().toISOString(),
      details: `Gift card purchased for ${recipientEmail}`
    });
    
    writeData(data);
    
    console.log(`[AI-Enhanced] Gift card purchased: Code ${giftCard.code}, Value ₹${amount}, Recipient ${recipientEmail}`);
    
    // Add to Admin Notification Panel
    try {
      addNotification({
        type: 'marketing',
        title: 'Gift Card Purchased',
        message: `New gift card for ₹${amount} purchased for ${recipientEmail}`,
        priority: amount > 5000 ? 'high' : 'medium',
        link: '#marketing-management'
      });
    } catch (e) {
      console.error('Failed to add gift card notification:', e);
    }
    
    // Send email to recipient with gift card code
    try {
      await sendGiftCardEmail({
        code: giftCard.code,
        amount: giftCard.value,
        expiryDate: giftCard.expiresAt
      }, recipientEmail, senderName || 'A Friend');
    } catch (err) {
      console.error('Failed to send gift card email:', err.message);
    }
    
    res.json({
      success: true,
      message: 'Gift card purchased successfully',
      giftCard: {
        code: giftCard.code,
        value: giftCard.value,
        expiresAt: giftCard.expiresAt
      }
    });
  } catch (error) {
    console.error('Error purchasing gift card:', error);
    res.status(500).json({ success: false, error: 'Failed to purchase gift card' });
  }
});

// Redeem gift card (apply to order)
router.post('/redeem', authenticate, async (req, res) => {
  try {
    const { code, amount } = req.body;
    const data = readData();
    
    const cardIndex = data.giftCards.findIndex(c => c.code.toUpperCase() === code.toUpperCase());
    
    if (cardIndex === -1) {
      return res.status(404).json({ success: false, error: 'Gift card not found' });
    }
    
    const card = data.giftCards[cardIndex];
    
    // Check if active
    if (card.status !== 'active') {
      return res.status(400).json({ success: false, error: 'Gift card is not active' });
    }
    
    // Check if expired
    if (new Date(card.expiresAt) < new Date()) {
      card.status = 'expired';
      writeData(data);
      return res.status(400).json({ success: false, error: 'Gift card has expired' });
    }
    
    // Check balance
    const redeemAmount = Math.min(amount || card.balance, card.balance);
    if (redeemAmount <= 0) {
      return res.status(400).json({ success: false, error: 'Gift card has no balance' });
    }
    
    // Deduct balance
    card.balance -= redeemAmount;
    if (card.balance <= 0) {
      card.balance = 0;
      card.status = 'redeemed';
    }
    card.lastUsedAt = new Date().toISOString();
    
    data.giftCards[cardIndex] = card;
    
    // Record transaction
    data.transactions.push({
      id: 'tx_' + uuidv4(),
      giftCardId: card.id,
      type: 'redeem',
      amount: redeemAmount,
      userId: req.user.id,
      date: new Date().toISOString(),
      details: `Redeemed by ${req.user.email}`
    });
    
    writeData(data);
    
    res.json({
      success: true,
      redeemedAmount: redeemAmount,
      remainingBalance: card.balance,
      message: `₹${redeemAmount} has been applied to your order`
    });
  } catch (error) {
    console.error('Error redeeming gift card:', error);
    res.status(500).json({ success: false, error: 'Failed to redeem gift card' });
  }
});

// ============================================
// ADMIN ROUTES
// ============================================

// Get all gift cards (admin)
router.get('/', authenticate, requireAdmin, async (req, res) => {
  try {
    const data = readData();
    res.json({
      success: true,
      giftCards: data.giftCards,
      settings: data.settings
    });
  } catch (error) {
    console.error('Error getting gift cards:', error);
    res.status(500).json({ success: false, error: 'Failed to get gift cards' });
  }
});

// Create gift cards (admin)
router.post('/', authenticate, requireAdmin, async (req, res) => {
  try {
    const { cards } = req.body;
    const data = readData();
    
    const createdCards = [];
    for (const cardData of (cards || [])) {
      // Ensure unique code
      let code = cardData.code;
      if (!code || data.giftCards.some(c => c.code === code)) {
        do {
          code = generateCode();
        } while (data.giftCards.some(c => c.code === code));
      }
      
      const card = {
        id: cardData.id || 'gc_' + uuidv4(),
        code: code,
        value: cardData.value || 500,
        balance: cardData.balance || cardData.value || 500,
        status: cardData.status || 'active',
        recipientName: '',
        recipientEmail: '',
        senderName: 'Blackonn Admin',
        senderEmail: '',
        message: '',
        createdBy: req.user.id,
        createdAt: cardData.createdAt || new Date().toISOString(),
        expiresAt: cardData.expiresAt || (() => {
          const d = new Date();
          d.setDate(d.getDate() + data.settings.defaultExpiryDays);
          return d.toISOString();
        })()
      };
      
      data.giftCards.push(card);
      createdCards.push(card);
    }
    
    writeData(data);
    
    res.json({
      success: true,
      message: `${createdCards.length} gift card(s) created`,
      giftCards: createdCards
    });
  } catch (error) {
    console.error('Error creating gift cards:', error);
    res.status(500).json({ success: false, error: 'Failed to create gift cards' });
  }
});

// Update gift card (admin)
router.patch('/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    const data = readData();
    
    const cardIndex = data.giftCards.findIndex(c => c.id === id);
    if (cardIndex === -1) {
      return res.status(404).json({ success: false, error: 'Gift card not found' });
    }
    
    // Update allowed fields
    const allowedFields = ['status', 'balance', 'expiresAt'];
    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        data.giftCards[cardIndex][field] = updates[field];
      }
    }
    
    data.giftCards[cardIndex].updatedAt = new Date().toISOString();
    writeData(data);
    
    res.json({
      success: true,
      message: 'Gift card updated',
      giftCard: data.giftCards[cardIndex]
    });
  } catch (error) {
    console.error('Error updating gift card:', error);
    res.status(500).json({ success: false, error: 'Failed to update gift card' });
  }
});

// Delete gift card (admin)
router.delete('/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const data = readData();
    
    const cardIndex = data.giftCards.findIndex(c => c.id === id);
    if (cardIndex === -1) {
      return res.status(404).json({ success: false, error: 'Gift card not found' });
    }
    
    data.giftCards.splice(cardIndex, 1);
    writeData(data);
    
    res.json({ success: true, message: 'Gift card deleted' });
  } catch (error) {
    console.error('Error deleting gift card:', error);
    res.status(500).json({ success: false, error: 'Failed to delete gift card' });
  }
});

// Get gift card settings (admin)
router.get('/settings', authenticate, requireAdmin, async (req, res) => {
  try {
    const data = readData();
    res.json({ success: true, settings: data.settings });
  } catch (error) {
    console.error('Error getting gift card settings:', error);
    res.status(500).json({ success: false, error: 'Failed to get settings' });
  }
});

// Update gift card settings (admin)
router.patch('/settings', authenticate, requireAdmin, async (req, res) => {
  try {
    const updates = req.body;
    const data = readData();
    
    Object.assign(data.settings, updates);
    writeData(data);
    
    res.json({ success: true, message: 'Settings updated', settings: data.settings });
  } catch (error) {
    console.error('Error updating gift card settings:', error);
    res.status(500).json({ success: false, error: 'Failed to update settings' });
  }
});

// Get transactions (admin)
router.get('/transactions', authenticate, requireAdmin, async (req, res) => {
  try {
    const data = readData();
    res.json({ success: true, transactions: data.transactions || [] });
  } catch (error) {
    console.error('Error getting transactions:', error);
    res.status(500).json({ success: false, error: 'Failed to get transactions' });
  }
});

module.exports = router;
