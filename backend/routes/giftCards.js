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
const { sendGiftCardEmail, sendGiftCardPurchaseConfirmation } = require('../utils/email');
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
    const data = JSON.parse(fs.readFileSync(GIFT_CARDS_FILE, 'utf-8'));
    // Ensure all required properties exist
    return {
      giftCards: data.giftCards || [],
      transactions: data.transactions || [],
      settings: data.settings || { enabled: true, minAmount: 100, maxAmount: 50000, defaultExpiryDays: 365 }
    };
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
    const { value, recipientName, recipientEmail, senderName, senderEmail, message, paymentId } = req.body;
    
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
    
    // Log payment info for tracking
    if (paymentId) {
      console.log(`[GiftCard] Purchase with payment ID: ${paymentId}`);
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
      paymentId: paymentId || null,
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
      paymentId: paymentId || null,
      date: new Date().toISOString(),
      details: `Gift card purchased for ${recipientEmail}${paymentId ? ' (Payment: ' + paymentId + ')' : ''}`
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
      
      // Also send confirmation to sender
      if (senderEmail) {
        await sendGiftCardPurchaseConfirmation({
          code: giftCard.code,
          amount: giftCard.value
        }, senderEmail, recipientEmail);
      }
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

    // Ownership Check: If card is claimed by someone else, block use.
    if (card.claimedBy && card.claimedBy !== req.user.id) {
      return res.status(400).json({ success: false, error: 'This gift card is linked to another account' });
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
    
    // REDUCTABLE BALANCE: Balance is deducted, card remains active for the owner if balance > 0
    const originalBalance = card.balance;
    card.balance -= redeemAmount;
    
    if (card.balance <= 0) {
      card.balance = 0;
      card.status = 'redeemed';
    } else {
      card.status = 'active'; 
    }

    card.claimedBy = req.user.id; 
    card.lastUsedAt = new Date().toISOString();
    
    data.giftCards[cardIndex] = card;
    
    // Record transaction
    data.transactions.push({
      id: 'tx_redeem_' + uuidv4(),
      giftCardId: card.id,
      type: 'redeem',
      amount: redeemAmount,
      remainingBalance: card.balance,
      userId: req.user.id,
      date: new Date().toISOString(),
      details: `Partial redemption by owner ${req.user.email}`
    });
    
    writeData(data);
    
    res.json({
      success: true,
      redeemedAmount: redeemAmount,
      remainingBalance: card.balance,
      message: card.balance > 0 
        ? `₹${redeemAmount} applied. Remaining balance: ₹${card.balance}`
        : `₹${redeemAmount} applied. Gift card fully redeemed.`
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

// ============================================
// USER ROUTES - Get user's gift cards
// ============================================

// Get user's gift cards (cards they purchased or received)
// Add gift card to user's account (claim a gift card)
router.post('/add-to-account', authenticate, async (req, res) => {
  try {
    const { code } = req.body;
    const userEmail = req.user.email || '';
    
    if (!code) {
      return res.status(400).json({ success: false, error: 'Gift card code is required' });
    }
    
    const data = readData();
    const cardIndex = data.giftCards.findIndex(c => c.code.toUpperCase() === code.toUpperCase());
    
    if (cardIndex === -1) {
      return res.status(404).json({ success: false, error: 'Gift card not found' });
    }
    
    const card = data.giftCards[cardIndex];
    const userId = req.user.id;
    
    // Check if expired
    if (new Date(card.expiresAt) < new Date()) {
      return res.status(400).json({ success: false, error: 'This gift card has expired' });
    }
    
    // Check if already fully used
    if (card.status === 'redeemed' || card.balance <= 0) {
      return res.status(400).json({ success: false, error: 'This gift card has already been redeemed' });
    }
    
    // ACCOUNT LOCKING: If card is already claimed by someone else, it cannot be added/used by others.
    if (card.claimedBy && card.claimedBy !== userId) {
      return res.status(400).json({ success: false, error: 'This gift card has already been claimed by another account' });
    }
    
    // Check if already linked to this user
    if (card.claimedBy === userId) {
      return res.json({ 
        success: true, 
        message: 'Gift card is already in your account',
        balance: card.balance,
        code: card.code
      });
    }
    
    // Link the gift card to this user (for tracking in their profile)
    data.giftCards[cardIndex].claimedAt = new Date().toISOString();
    data.giftCards[cardIndex].claimedBy = userId;
    
    writeData(data);
    
    console.log(`[Gift Cards] Card ${card.code} claimed by ${userEmail}`);
    
    res.json({ 
      success: true, 
      message: 'Gift card added to your account',
      balance: card.balance,
      code: card.code
    });
  } catch (error) {
    console.error('Error adding gift card to account:', error);
    res.status(500).json({ success: false, error: 'Failed to add gift card' });
  }
});

router.get('/my-cards', authenticate, async (req, res) => {
  try {
    const data = readData();
    const userId = req.user.id;
    const userEmail = req.user.email || '';
    
    // Cards purchased by user
    const purchasedCards = data.giftCards.filter(c => c.purchasedBy === userId);
    
    // Cards sent to user's email (received as gifts)
    const receivedCards = data.giftCards.filter(c => 
      userEmail && c.recipientEmail && c.recipientEmail.toLowerCase() === userEmail.toLowerCase()
    );
    
    // Combine and deduplicate
    const allCardsMap = new Map();
    [...purchasedCards, ...receivedCards].forEach(card => {
      if (!allCardsMap.has(card.id)) {
        allCardsMap.set(card.id, {
          ...card,
          isPurchased: card.purchasedBy === userId,
          isReceived: userEmail && card.recipientEmail && card.recipientEmail.toLowerCase() === userEmail.toLowerCase()
        });
      } else {
        // If already exists, mark both flags
        const existing = allCardsMap.get(card.id);
        existing.isPurchased = existing.isPurchased || card.purchasedBy === userId;
        existing.isReceived = existing.isReceived || (userEmail && card.recipientEmail && card.recipientEmail.toLowerCase() === userEmail.toLowerCase());
      }
    });
    
    const userCards = Array.from(allCardsMap.values());
    
    // Get transactions for these cards
    const cardIds = userCards.map(c => c.id);
    const userTransactions = (data.transactions || []).filter(t => 
      cardIds.includes(t.giftCardId) || t.userId === userId
    );
    
    // Calculate totals
    const totalPurchased = purchasedCards.reduce((sum, c) => sum + c.value, 0);
    const totalReceived = receivedCards.filter(c => c.purchasedBy !== userId).reduce((sum, c) => sum + c.value, 0);
    const totalBalance = userCards.reduce((sum, c) => sum + (c.balance || 0), 0);
    const totalUsed = userCards.reduce((sum, c) => sum + (c.value - (c.balance || 0)), 0);
    
    res.json({
      success: true,
      cards: userCards.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)),
      transactions: userTransactions.sort((a, b) => new Date(b.date) - new Date(a.date)),
      summary: {
        totalCards: userCards.length,
        totalPurchased,
        totalReceived,
        totalBalance,
        totalUsed,
        activeCards: userCards.filter(c => c.status === 'active' && c.balance > 0).length
      }
    });
  } catch (error) {
    console.error('Error getting user gift cards:', error);
    res.status(500).json({ success: false, error: 'Failed to get gift cards' });
  }
});

module.exports = router;
