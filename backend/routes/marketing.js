/**
 * Marketing & Promotions Routes
 * Handles coupons, discounts, sales, bundles, gift cards, popups
 * All features require activation to work
 */

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');
const { authenticate, requireAdmin, optionalAuth } = require('../middleware/auth');
const { aiRequestLogger, aiPerformanceMonitor } = require('../middleware/aiEnhancer');

const router = express.Router();

// AI Middleware
router.use(aiRequestLogger);
router.use(aiPerformanceMonitor(500));

// Data file path
const DATA_DIR = path.join(__dirname, '..', 'data');
const MARKETING_FILE = path.join(DATA_DIR, 'marketing.json');

// Ensure data file exists
function ensureDataFile() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(MARKETING_FILE)) {
    const defaultData = {
      settings: {
        couponsEnabled: false,
        salesEnabled: false,
        bundlesEnabled: false,
        giftCardsEnabled: false,
        popupsEnabled: false,
        abandonedCartEnabled: false,
        invoiceEnabled: true
      },
      coupons: [],
      sales: [],
      bundles: [],
      giftCards: [],
      popups: [],
      abandonedCarts: []
    };
    fs.writeFileSync(MARKETING_FILE, JSON.stringify(defaultData, null, 2));
  }
}

function readData() {
  ensureDataFile();
  try {
    return JSON.parse(fs.readFileSync(MARKETING_FILE, 'utf8'));
  } catch (e) {
    console.error('Error reading marketing data:', e);
    return { settings: {}, coupons: [], sales: [], bundles: [], giftCards: [], popups: [], abandonedCarts: [] };
  }
}

function writeData(data) {
  ensureDataFile();
  fs.writeFileSync(MARKETING_FILE, JSON.stringify(data, null, 2));
}

// ===============================
// SETTINGS (Enable/Disable Features)
// ===============================

// Get all marketing settings
router.get('/settings', authenticate, requireAdmin, (req, res) => {
  try {
    const data = readData();
    res.json({ success: true, settings: data.settings });
  } catch (error) {
    console.error('Get settings error:', error);
    res.status(500).json({ success: false, error: 'Failed to get settings' });
  }
});

// Update marketing settings
router.patch('/settings', authenticate, requireAdmin, (req, res) => {
  try {
    const data = readData();
    const { couponsEnabled, salesEnabled, bundlesEnabled, giftCardsEnabled, popupsEnabled, abandonedCartEnabled, invoiceEnabled } = req.body;
    
    if (typeof couponsEnabled === 'boolean') data.settings.couponsEnabled = couponsEnabled;
    if (typeof salesEnabled === 'boolean') data.settings.salesEnabled = salesEnabled;
    if (typeof bundlesEnabled === 'boolean') data.settings.bundlesEnabled = bundlesEnabled;
    if (typeof giftCardsEnabled === 'boolean') data.settings.giftCardsEnabled = giftCardsEnabled;
    if (typeof popupsEnabled === 'boolean') data.settings.popupsEnabled = popupsEnabled;
    if (typeof abandonedCartEnabled === 'boolean') data.settings.abandonedCartEnabled = abandonedCartEnabled;
    if (typeof invoiceEnabled === 'boolean') data.settings.invoiceEnabled = invoiceEnabled;
    
    data.settings.updatedAt = new Date().toISOString();
    writeData(data);
    
    res.json({ success: true, settings: data.settings });
  } catch (error) {
    console.error('Update settings error:', error);
    res.status(500).json({ success: false, error: 'Failed to update settings' });
  }
});

// ===============================
// PUBLIC FEATURE VISIBILITY
// ===============================

// Public endpoint to check which features are enabled (no auth required)
router.get('/feature-visibility', (req, res) => {
  try {
    // Prevent caching so changes take effect immediately
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    
    const data = readData();
    // Only expose visibility settings, not sensitive data
    res.json({
      success: true,
      features: {
        giftCardsEnabled: data.settings.giftCardsEnabled || false,
        invoiceEnabled: data.settings.invoiceEnabled !== false // default true
      }
    });
  } catch (error) {
    console.error('Get feature visibility error:', error);
    // Return defaults on error
    res.json({
      success: true,
      features: {
        giftCardsEnabled: false,
        invoiceEnabled: true
      }
    });
  }
});

// Public endpoint to check promo/discount availability for checkout (no auth required)
router.get('/status', (req, res) => {
  try {
    // Prevent caching so changes take effect immediately
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    
    const data = readData();
    res.json({
      success: true,
      couponsEnabled: data.settings.couponsEnabled || false,
      giftCardsEnabled: data.settings.giftCardsEnabled || false
    });
  } catch (error) {
    console.error('Get marketing status error:', error);
    res.json({
      success: true,
      couponsEnabled: false,
      giftCardsEnabled: false
    });
  }
});

// ===============================
// COUPONS & DISCOUNTS
// ===============================

// Get all coupons
router.get('/coupons', authenticate, requireAdmin, (req, res) => {
  try {
    const data = readData();
    res.json({ success: true, coupons: data.coupons, enabled: data.settings.couponsEnabled });
  } catch (error) {
    console.error('Get coupons error:', error);
    res.status(500).json({ success: false, error: 'Failed to get coupons' });
  }
});

// Create coupon
router.post('/coupons', authenticate, requireAdmin, (req, res) => {
  try {
    const data = readData();
    const { code, type, value, minOrder, maxDiscount, validFrom, validUntil, usageLimit, description } = req.body;
    
    if (!code || !type || !value) {
      return res.status(400).json({ success: false, error: 'Code, type, and value are required' });
    }
    
    // Check for duplicate code
    if (data.coupons.find(c => c.code.toUpperCase() === code.toUpperCase())) {
      return res.status(400).json({ success: false, error: 'Coupon code already exists' });
    }
    
    const coupon = {
      id: uuidv4(),
      code: code.toUpperCase(),
      type, // 'percentage' or 'fixed'
      value: parseFloat(value),
      minOrder: parseFloat(minOrder) || 0,
      maxDiscount: parseFloat(maxDiscount) || null,
      validFrom: validFrom || new Date().toISOString(),
      validUntil: validUntil || null,
      usageLimit: parseInt(usageLimit) || null,
      usedCount: 0,
      description: description || '',
      active: true,
      createdAt: new Date().toISOString()
    };
    
    data.coupons.push(coupon);
    writeData(data);

    console.log(`[AI-Enhanced] Coupon created: ${coupon.code}, Type: ${coupon.type}, Value: ${coupon.value}`);
    
    res.status(201).json({ success: true, coupon });
  } catch (error) {
    console.error('Create coupon error:', error);
    res.status(500).json({ success: false, error: 'Failed to create coupon' });
  }
});

// Validate coupon (public endpoint)
router.post('/coupons/validate', optionalAuth, (req, res) => {
  try {
    const data = readData();
    
    // Check if coupons are enabled
    if (!data.settings.couponsEnabled) {
      return res.status(400).json({ success: false, error: 'Coupons are currently disabled' });
    }
    
    const { code, orderTotal } = req.body;
    
    if (!code) {
      return res.status(400).json({ success: false, error: 'Coupon code is required' });
    }
    
    const coupon = data.coupons.find(c => c.code.toUpperCase() === code.toUpperCase() && c.active);
    
    if (!coupon) {
      return res.status(404).json({ success: false, error: 'Invalid coupon code' });
    }
    
    // Check validity
    const now = new Date();
    if (coupon.validFrom && new Date(coupon.validFrom) > now) {
      return res.status(400).json({ success: false, error: 'Coupon is not yet valid' });
    }
    if (coupon.validUntil && new Date(coupon.validUntil) < now) {
      return res.status(400).json({ success: false, error: 'Coupon has expired' });
    }
    if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) {
      return res.status(400).json({ success: false, error: 'Coupon usage limit reached' });
    }
    if (coupon.minOrder && orderTotal < coupon.minOrder) {
      return res.status(400).json({ success: false, error: `Minimum order of ₹${coupon.minOrder} required` });
    }
    
    // Calculate discount
    let discount = 0;
    if (coupon.type === 'percentage') {
      discount = (orderTotal * coupon.value) / 100;
      if (coupon.maxDiscount) {
        discount = Math.min(discount, coupon.maxDiscount);
      }
    } else {
      discount = coupon.value;
    }
    
    res.json({ 
      success: true, 
      valid: true,
      coupon: {
        code: coupon.code,
        type: coupon.type,
        value: coupon.value,
        description: coupon.description
      },
      discount: Math.round(discount * 100) / 100
    });
  } catch (error) {
    console.error('Validate coupon error:', error);
    res.status(500).json({ success: false, error: 'Failed to validate coupon' });
  }
});

// Update coupon
router.patch('/coupons/:id', authenticate, requireAdmin, (req, res) => {
  try {
    const data = readData();
    const idx = data.coupons.findIndex(c => c.id === req.params.id);
    
    if (idx === -1) {
      return res.status(404).json({ success: false, error: 'Coupon not found' });
    }
    
    const updates = req.body;
    delete updates.id;
    delete updates.usedCount;
    delete updates.createdAt;
    
    data.coupons[idx] = { ...data.coupons[idx], ...updates, updatedAt: new Date().toISOString() };
    writeData(data);
    
    res.json({ success: true, coupon: data.coupons[idx] });
  } catch (error) {
    console.error('Update coupon error:', error);
    res.status(500).json({ success: false, error: 'Failed to update coupon' });
  }
});

// Delete coupon
router.delete('/coupons/:id', authenticate, requireAdmin, (req, res) => {
  try {
    const data = readData();
    const idx = data.coupons.findIndex(c => c.id === req.params.id);
    
    if (idx === -1) {
      return res.status(404).json({ success: false, error: 'Coupon not found' });
    }
    
    data.coupons.splice(idx, 1);
    writeData(data);
    
    res.json({ success: true, message: 'Coupon deleted' });
  } catch (error) {
    console.error('Delete coupon error:', error);
    res.status(500).json({ success: false, error: 'Failed to delete coupon' });
  }
});

// ===============================
// SEASONAL SALES
// ===============================

// Get all sales
router.get('/sales', authenticate, requireAdmin, (req, res) => {
  try {
    const data = readData();
    res.json({ success: true, sales: data.sales, enabled: data.settings.salesEnabled });
  } catch (error) {
    console.error('Get sales error:', error);
    res.status(500).json({ success: false, error: 'Failed to get sales' });
  }
});

// Create sale
router.post('/sales', authenticate, requireAdmin, (req, res) => {
  try {
    const data = readData();
    const { name, type, discountPercent, productIds, categoryIds, startDate, endDate, description, bannerImage } = req.body;
    
    if (!name || !discountPercent) {
      return res.status(400).json({ success: false, error: 'Name and discount percentage are required' });
    }
    
    const sale = {
      id: uuidv4(),
      name,
      type: type || 'seasonal', // 'seasonal', 'festive', 'clearance', 'flash'
      discountPercent: parseFloat(discountPercent),
      productIds: productIds || [], // Empty means all products
      categoryIds: categoryIds || [],
      startDate: startDate || new Date().toISOString(),
      endDate: endDate || null,
      description: description || '',
      bannerImage: bannerImage || '',
      active: true,
      createdAt: new Date().toISOString()
    };
    
    data.sales.push(sale);
    writeData(data);
    
    res.status(201).json({ success: true, sale });
  } catch (error) {
    console.error('Create sale error:', error);
    res.status(500).json({ success: false, error: 'Failed to create sale' });
  }
});

// Get active sales (public)
router.get('/sales/active', optionalAuth, (req, res) => {
  try {
    const data = readData();
    
    if (!data.settings.salesEnabled) {
      return res.json({ success: true, sales: [] });
    }
    
    const now = new Date();
    const activeSales = data.sales.filter(s => {
      if (!s.active) return false;
      if (s.startDate && new Date(s.startDate) > now) return false;
      if (s.endDate && new Date(s.endDate) < now) return false;
      return true;
    });
    
    res.json({ success: true, sales: activeSales });
  } catch (error) {
    console.error('Get active sales error:', error);
    res.status(500).json({ success: false, error: 'Failed to get active sales' });
  }
});

// Update sale
router.patch('/sales/:id', authenticate, requireAdmin, (req, res) => {
  try {
    const data = readData();
    const idx = data.sales.findIndex(s => s.id === req.params.id);
    
    if (idx === -1) {
      return res.status(404).json({ success: false, error: 'Sale not found' });
    }
    
    const updates = req.body;
    delete updates.id;
    delete updates.createdAt;
    
    data.sales[idx] = { ...data.sales[idx], ...updates, updatedAt: new Date().toISOString() };
    writeData(data);
    
    res.json({ success: true, sale: data.sales[idx] });
  } catch (error) {
    console.error('Update sale error:', error);
    res.status(500).json({ success: false, error: 'Failed to update sale' });
  }
});

// Delete sale
router.delete('/sales/:id', authenticate, requireAdmin, (req, res) => {
  try {
    const data = readData();
    const idx = data.sales.findIndex(s => s.id === req.params.id);
    
    if (idx === -1) {
      return res.status(404).json({ success: false, error: 'Sale not found' });
    }
    
    data.sales.splice(idx, 1);
    writeData(data);
    
    res.json({ success: true, message: 'Sale deleted' });
  } catch (error) {
    console.error('Delete sale error:', error);
    res.status(500).json({ success: false, error: 'Failed to delete sale' });
  }
});

// ===============================
// BUNDLES & COMBO OFFERS
// ===============================

// Get all bundles
router.get('/bundles', authenticate, requireAdmin, (req, res) => {
  try {
    const data = readData();
    res.json({ success: true, bundles: data.bundles, enabled: data.settings.bundlesEnabled });
  } catch (error) {
    console.error('Get bundles error:', error);
    res.status(500).json({ success: false, error: 'Failed to get bundles' });
  }
});

// Create bundle
router.post('/bundles', authenticate, requireAdmin, (req, res) => {
  try {
    const data = readData();
    const { name, productIds, bundlePrice, originalPrice, validUntil, description, image } = req.body;
    
    if (!name || !productIds || !bundlePrice) {
      return res.status(400).json({ success: false, error: 'Name, products, and bundle price are required' });
    }
    
    const bundle = {
      id: uuidv4(),
      name,
      productIds,
      bundlePrice: parseFloat(bundlePrice),
      originalPrice: parseFloat(originalPrice) || 0,
      savings: (parseFloat(originalPrice) || 0) - parseFloat(bundlePrice),
      validUntil: validUntil || null,
      description: description || '',
      image: image || '',
      active: true,
      createdAt: new Date().toISOString()
    };
    
    data.bundles.push(bundle);
    writeData(data);
    
    res.status(201).json({ success: true, bundle });
  } catch (error) {
    console.error('Create bundle error:', error);
    res.status(500).json({ success: false, error: 'Failed to create bundle' });
  }
});

// Get active bundles (public)
router.get('/bundles/active', optionalAuth, (req, res) => {
  try {
    const data = readData();
    
    if (!data.settings.bundlesEnabled) {
      return res.json({ success: true, bundles: [] });
    }
    
    const now = new Date();
    const activeBundles = data.bundles.filter(b => {
      if (!b.active) return false;
      if (b.validUntil && new Date(b.validUntil) < now) return false;
      return true;
    });
    
    res.json({ success: true, bundles: activeBundles });
  } catch (error) {
    console.error('Get active bundles error:', error);
    res.status(500).json({ success: false, error: 'Failed to get active bundles' });
  }
});

// Update bundle
router.patch('/bundles/:id', authenticate, requireAdmin, (req, res) => {
  try {
    const data = readData();
    const idx = data.bundles.findIndex(b => b.id === req.params.id);
    
    if (idx === -1) {
      return res.status(404).json({ success: false, error: 'Bundle not found' });
    }
    
    const updates = req.body;
    delete updates.id;
    delete updates.createdAt;
    
    data.bundles[idx] = { ...data.bundles[idx], ...updates, updatedAt: new Date().toISOString() };
    writeData(data);
    
    res.json({ success: true, bundle: data.bundles[idx] });
  } catch (error) {
    console.error('Update bundle error:', error);
    res.status(500).json({ success: false, error: 'Failed to update bundle' });
  }
});

// Delete bundle
router.delete('/bundles/:id', authenticate, requireAdmin, (req, res) => {
  try {
    const data = readData();
    const idx = data.bundles.findIndex(b => b.id === req.params.id);
    
    if (idx === -1) {
      return res.status(404).json({ success: false, error: 'Bundle not found' });
    }
    
    data.bundles.splice(idx, 1);
    writeData(data);
    
    res.json({ success: true, message: 'Bundle deleted' });
  } catch (error) {
    console.error('Delete bundle error:', error);
    res.status(500).json({ success: false, error: 'Failed to delete bundle' });
  }
});

// ===============================
// GIFT CARDS
// ===============================

// Get all gift cards
router.get('/giftcards', authenticate, requireAdmin, (req, res) => {
  try {
    const data = readData();
    res.json({ success: true, giftCards: data.giftCards, enabled: data.settings.giftCardsEnabled });
  } catch (error) {
    console.error('Get gift cards error:', error);
    res.status(500).json({ success: false, error: 'Failed to get gift cards' });
  }
});

// Create gift card
router.post('/giftcards', authenticate, requireAdmin, (req, res) => {
  try {
    const data = readData();
    const { value, recipientEmail, recipientName, senderName, message, validMonths } = req.body;
    
    if (!value) {
      return res.status(400).json({ success: false, error: 'Value is required' });
    }
    
    // Generate unique gift card code
    const code = 'GC-' + uuidv4().substring(0, 8).toUpperCase();
    
    const giftCard = {
      id: uuidv4(),
      code,
      value: parseFloat(value),
      balance: parseFloat(value),
      recipientEmail: recipientEmail || '',
      recipientName: recipientName || '',
      senderName: senderName || 'Blackonn',
      message: message || '',
      validUntil: new Date(Date.now() + (validMonths || 12) * 30 * 24 * 60 * 60 * 1000).toISOString(),
      used: false,
      usedAt: null,
      createdAt: new Date().toISOString()
    };
    
    data.giftCards.push(giftCard);
    writeData(data);
    
    res.status(201).json({ success: true, giftCard });
  } catch (error) {
    console.error('Create gift card error:', error);
    res.status(500).json({ success: false, error: 'Failed to create gift card' });
  }
});

// Validate gift card (public)
router.post('/giftcards/validate', optionalAuth, (req, res) => {
  try {
    const data = readData();
    
    if (!data.settings.giftCardsEnabled) {
      return res.status(400).json({ success: false, error: 'Gift cards are currently disabled' });
    }
    
    const { code } = req.body;
    
    if (!code) {
      return res.status(400).json({ success: false, error: 'Gift card code is required' });
    }
    
    const giftCard = data.giftCards.find(g => g.code.toUpperCase() === code.toUpperCase());
    
    if (!giftCard) {
      return res.status(404).json({ success: false, error: 'Invalid gift card code' });
    }
    
    if (giftCard.balance <= 0) {
      return res.status(400).json({ success: false, error: 'Gift card has no balance' });
    }
    
    if (new Date(giftCard.validUntil) < new Date()) {
      return res.status(400).json({ success: false, error: 'Gift card has expired' });
    }
    
    res.json({ 
      success: true, 
      valid: true,
      giftCard: {
        code: giftCard.code,
        balance: giftCard.balance,
        validUntil: giftCard.validUntil
      }
    });
  } catch (error) {
    console.error('Validate gift card error:', error);
    res.status(500).json({ success: false, error: 'Failed to validate gift card' });
  }
});

// ===============================
// HOMEPAGE POPUPS
// ===============================

// Get all popups
router.get('/popups', authenticate, requireAdmin, (req, res) => {
  try {
    const data = readData();
    res.json({ success: true, popups: data.popups, enabled: data.settings.popupsEnabled });
  } catch (error) {
    console.error('Get popups error:', error);
    res.status(500).json({ success: false, error: 'Failed to get popups' });
  }
});

// Create popup
router.post('/popups', authenticate, requireAdmin, (req, res) => {
  try {
    const data = readData();
    const { title, message, ctaText, ctaLink, image, delay, showOnce, validUntil } = req.body;
    
    if (!title || !message) {
      return res.status(400).json({ success: false, error: 'Title and message are required' });
    }
    
    const popup = {
      id: uuidv4(),
      title,
      message,
      ctaText: ctaText || 'Shop Now',
      ctaLink: ctaLink || '/products.html',
      image: image || '',
      delay: parseInt(delay) || 5000, // 5 seconds default
      showOnce: showOnce !== false, // true by default
      validUntil: validUntil || null,
      active: true,
      createdAt: new Date().toISOString()
    };
    
    data.popups.push(popup);
    writeData(data);
    
    res.status(201).json({ success: true, popup });
  } catch (error) {
    console.error('Create popup error:', error);
    res.status(500).json({ success: false, error: 'Failed to create popup' });
  }
});

// Get active popup (public)
router.get('/popups/active', (req, res) => {
  try {
    const data = readData();
    
    if (!data.settings.popupsEnabled) {
      return res.json({ success: true, popup: null });
    }
    
    const now = new Date();
    const activePopup = data.popups.find(p => {
      if (!p.active) return false;
      if (p.validUntil && new Date(p.validUntil) < now) return false;
      return true;
    });
    
    res.json({ success: true, popup: activePopup || null });
  } catch (error) {
    console.error('Get active popup error:', error);
    res.status(500).json({ success: false, error: 'Failed to get active popup' });
  }
});

// Update popup
router.patch('/popups/:id', authenticate, requireAdmin, (req, res) => {
  try {
    const data = readData();
    const idx = data.popups.findIndex(p => p.id === req.params.id);
    
    if (idx === -1) {
      return res.status(404).json({ success: false, error: 'Popup not found' });
    }
    
    const updates = req.body;
    delete updates.id;
    delete updates.createdAt;
    
    data.popups[idx] = { ...data.popups[idx], ...updates, updatedAt: new Date().toISOString() };
    writeData(data);
    
    res.json({ success: true, popup: data.popups[idx] });
  } catch (error) {
    console.error('Update popup error:', error);
    res.status(500).json({ success: false, error: 'Failed to update popup' });
  }
});

// Delete popup
router.delete('/popups/:id', authenticate, requireAdmin, (req, res) => {
  try {
    const data = readData();
    const idx = data.popups.findIndex(p => p.id === req.params.id);
    
    if (idx === -1) {
      return res.status(404).json({ success: false, error: 'Popup not found' });
    }
    
    data.popups.splice(idx, 1);
    writeData(data);
    
    res.json({ success: true, message: 'Popup deleted' });
  } catch (error) {
    console.error('Delete popup error:', error);
    res.status(500).json({ success: false, error: 'Failed to delete popup' });
  }
});

// ===============================
// NEWSLETTER SUBSCRIPTIONS
module.exports = router;
