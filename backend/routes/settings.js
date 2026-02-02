/**
 * Admin Settings Routes
 * Master toggles for admin sections
 */

const express = require('express');
const fs = require('fs');
const path = require('path');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { aiRequestLogger, aiPerformanceMonitor } = require('../middleware/aiEnhancer');

const router = express.Router();

// AI-OPTIMIZED: Disable caching for all administrative settings
router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  next();
});

// AI Middleware
router.use(aiRequestLogger);
router.use(aiPerformanceMonitor(500));

// Data file path
const DATA_DIR = path.join(__dirname, '..', 'data');
const SETTINGS_FILE = path.join(DATA_DIR, 'adminSettings.json');
const MARKETING_FILE = path.join(DATA_DIR, 'marketing.json');
const PRODUCT_COSTS_FILE = path.join(DATA_DIR, 'productCosts.json');
const PRODUCT_COST_PROFILES_FILE = path.join(DATA_DIR, 'productCostProfiles.json');

// Helper to sync gift cards setting to marketing.json
function syncGiftCardsToMarketing(enabled) {
  try {
    let marketingData = { settings: {} };
    if (fs.existsSync(MARKETING_FILE)) {
      marketingData = JSON.parse(fs.readFileSync(MARKETING_FILE, 'utf8'));
    }
    marketingData.settings = marketingData.settings || {};
    marketingData.settings.giftCardsEnabled = enabled;
    fs.writeFileSync(MARKETING_FILE, JSON.stringify(marketingData, null, 2));
  } catch (e) {
    console.error('Error syncing gift cards to marketing:', e);
  }
}

// Default settings
const defaultSettings = {
  sections: {
    skuManagement: { enabled: true, name: 'SKU & Barcode Management' },
    inventory: { enabled: true, name: 'Inventory & Stock Management' },
    marketing: { enabled: true, name: 'Marketing & Promotions' },
    shipping: { enabled: true, name: 'Shipping & Logistics' },
    tax: { enabled: true, name: 'Tax & GST Settings' },
    giftCards: { enabled: true, name: 'Gift Cards Management' },
    companyTax: { enabled: true, name: 'Company Tax' },
    reviewsPage: { enabled: true, name: 'Reviews Page Management' }
  },
  securitySettings: {
    allowDevConsole: false,
    rateLimitEnabled: true,
    csrfProtection: true,
    xssProtection: true
  },
  trustSettings: {
    showBadges: true,
    badges: [
      { id: 'ssl', title: '256-bit SSL', subtitle: 'Encrypted', icon: 'ri-lock-password-line' },
      { id: 'secure', title: '100% Safe', subtitle: 'Transactions', icon: 'ri-shield-star-line' },
      { id: 'returns', title: 'Easy Returns', subtitle: '7 Day Policy', icon: 'ri-refund-2-line' }
    ],
    showIndicators: true,
    indicators: [
      { id: 'secure-checkout', text: 'Secure Checkout', icon: 'ri-shield-check-fill' },
      { id: 'ssl-protected', text: 'SSL Protected', icon: 'ri-lock-line' }
    ]
  },
  updatedAt: null
};

// Ensure data file exists
function ensureDataFile() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(SETTINGS_FILE)) {
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(defaultSettings, null, 2));
  }
}

function readSettings() {
  ensureDataFile();
  try {
    const data = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
    // Merge with defaults to ensure all keys exist
    return {
      ...defaultSettings,
      ...data,
      sections: { ...defaultSettings.sections, ...data.sections },
      securitySettings: { ...defaultSettings.securitySettings, ...data.securitySettings },
      trustSettings: { ...defaultSettings.trustSettings, ...data.trustSettings }
    };
  } catch (e) {
    console.error('Error reading settings:', e);
    return defaultSettings;
  }
}

function writeSettings(data) {
  ensureDataFile();
  data.updatedAt = new Date().toISOString();
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(data, null, 2));
}

// Get all admin settings (admin only)
router.get('/', authenticate, requireAdmin, (req, res) => {
  try {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    const settings = readSettings();
    res.json({ success: true, settings });
  } catch (error) {
    console.error('Get settings error:', error);
    res.status(500).json({ success: false, error: 'Failed to get settings' });
  }
});

/**
 * GET /api/settings/public
 * Public settings for frontend (no auth required)
 */
router.get('/public', (req, res) => {
  try {
    const settings = readSettings();
    res.json({
      success: true,
      trustSettings: settings.trustSettings || defaultSettings.trustSettings
    });
  } catch (error) {
    console.error('Get public settings error:', error);
    res.status(500).json({ success: false, error: 'Failed to get public settings' });
  }
});

// Get public section visibility (no auth - for frontend to check which sections are enabled)
router.get('/sections/visibility', (req, res) => {
  try {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    const settings = readSettings();
    const visibility = {};
    Object.entries(settings.sections).forEach(([key, value]) => {
      visibility[key] = value.enabled;
    });
    res.json({ success: true, sections: visibility });
  } catch (error) {
    console.error('Get visibility error:', error);
    res.json({ success: true, sections: defaultSettings.sections });
  }
});

// Get public security settings (no auth - for frontend security manager)
router.get('/security', (req, res) => {
  console.log('[API] GET /api/settings/security hit');
  try {
    const settings = readSettings();
    res.json({ 
      success: true, 
      security: settings.securitySettings || defaultSettings.securitySettings 
    });
  } catch (error) {
    console.error('Get security settings error:', error);
    res.json({ success: true, security: defaultSettings.securitySettings });
  }
});

// Update security settings (admin only)
router.patch('/security', authenticate, requireAdmin, (req, res) => {
  try {
    const { allowDevConsole, rateLimitEnabled, csrfProtection, xssProtection } = req.body;
    
    const settings = readSettings();
    
    if (!settings.securitySettings) {
      settings.securitySettings = { ...defaultSettings.securitySettings };
    }
    
    if (allowDevConsole !== undefined) settings.securitySettings.allowDevConsole = Boolean(allowDevConsole);
    if (rateLimitEnabled !== undefined) settings.securitySettings.rateLimitEnabled = Boolean(rateLimitEnabled);
    if (csrfProtection !== undefined) settings.securitySettings.csrfProtection = Boolean(csrfProtection);
    if (xssProtection !== undefined) settings.securitySettings.xssProtection = Boolean(xssProtection);
    
    settings.updatedAt = new Date().toISOString();
    writeSettings(settings);
    
    console.log(`[Security] Settings updated:`, settings.securitySettings);
    
    res.json({ 
      success: true, 
      security: settings.securitySettings 
    });
  } catch (error) {
    console.error('Update security settings error:', error);
    res.status(500).json({ success: false, error: 'Failed to update security settings' });
  }
});

// Update section enabled status
router.patch('/sections/:sectionKey', authenticate, requireAdmin, (req, res) => {
  try {
    const { sectionKey } = req.params;
    const { enabled } = req.body;
    
    const settings = readSettings();
    
    if (!settings.sections[sectionKey]) {
      return res.status(404).json({ success: false, error: 'Section not found' });
    }
    
    settings.sections[sectionKey].enabled = Boolean(enabled);
    writeSettings(settings);
    
    console.log(`[AI-Enhanced] Section visibility updated: ${sectionKey}, Enabled: ${Boolean(enabled)}`);
    
    // Sync giftCards toggle to marketing settings for feature visibility
    if (sectionKey === 'giftCards') {
      syncGiftCardsToMarketing(Boolean(enabled));
    }
    
    res.json({ 
      success: true, 
      section: sectionKey, 
      enabled: settings.sections[sectionKey].enabled 
    });
  } catch (error) {
    console.error('Update section error:', error);
    res.status(500).json({ success: false, error: 'Failed to update section' });
  }
});

// Bulk update sections
router.patch('/sections', authenticate, requireAdmin, (req, res) => {
  try {
    const { sections } = req.body;
    
    if (!sections || typeof sections !== 'object') {
      return res.status(400).json({ success: false, error: 'Sections object required' });
    }
    
    const settings = readSettings();
    
    Object.entries(sections).forEach(([key, value]) => {
      if (settings.sections[key]) {
        settings.sections[key].enabled = Boolean(value);
      }
    });
    
    writeSettings(settings);
    
    res.json({ success: true, settings });
  } catch (error) {
    console.error('Bulk update error:', error);
    res.status(500).json({ success: false, error: 'Failed to update sections' });
  }
});

// =====================
// PRODUCT COST SETTINGS
// =====================

// Default product costs structure
const defaultProductCosts = {
  productCost: 0,         // Actual T-Shirt / Product purchase cost
  exportPrice: 0,         // Export price
  packagingCost: 0,       // Packaging cost
  thankYouCardCost: 0,    // Thank you card cost
  roundStickerCost: 0,    // Round sticker cost
  parcelEnvelopeCost: 0,  // Parcel envelope cost
  billPrintingCost: 0,    // Bill printing cost
  miscCost: 0,            // Miscellaneous costs
  shippingCharges: 0,     // Shipping charges per order
  usePercentageCOGS: false, // If true, use percentage-based cost of goods
  cogsPercentage: 40,     // Default COGS percentage (40%)
  updatedAt: null
};

function ensureProductCostsFile() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(PRODUCT_COSTS_FILE)) {
    fs.writeFileSync(PRODUCT_COSTS_FILE, JSON.stringify(defaultProductCosts, null, 2));
  }
}

function readProductCosts() {
  ensureProductCostsFile();
  try {
    const data = JSON.parse(fs.readFileSync(PRODUCT_COSTS_FILE, 'utf8'));
    return { ...defaultProductCosts, ...data };
  } catch (e) {
    console.error('Error reading product costs:', e);
    return defaultProductCosts;
  }
}

function writeProductCosts(data) {
  ensureProductCostsFile();
  data.updatedAt = new Date().toISOString();
  fs.writeFileSync(PRODUCT_COSTS_FILE, JSON.stringify(data, null, 2));
}

// Get product costs (admin only)
router.get('/product-costs', authenticate, requireAdmin, (req, res) => {
  try {
    const costs = readProductCosts();
    res.json({ success: true, costs });
  } catch (error) {
    console.error('Get product costs error:', error);
    res.status(500).json({ success: false, error: 'Failed to get product costs' });
  }
});

// Update product costs (admin only)
router.put('/product-costs', authenticate, requireAdmin, (req, res) => {
  try {
    const {
      productCost,
      exportPrice,
      packagingCost,
      thankYouCardCost,
      roundStickerCost,
      parcelEnvelopeCost,
      billPrintingCost,
      miscCost,
      shippingCharges,
      usePercentageCOGS,
      cogsPercentage
    } = req.body;

    const costs = readProductCosts();

    // Update only provided fields
    if (productCost !== undefined) costs.productCost = Number(productCost) || 0;
    if (exportPrice !== undefined) costs.exportPrice = Number(exportPrice) || 0;
    if (packagingCost !== undefined) costs.packagingCost = Number(packagingCost) || 0;
    if (thankYouCardCost !== undefined) costs.thankYouCardCost = Number(thankYouCardCost) || 0;
    if (roundStickerCost !== undefined) costs.roundStickerCost = Number(roundStickerCost) || 0;
    if (parcelEnvelopeCost !== undefined) costs.parcelEnvelopeCost = Number(parcelEnvelopeCost) || 0;
    if (billPrintingCost !== undefined) costs.billPrintingCost = Number(billPrintingCost) || 0;
    if (miscCost !== undefined) costs.miscCost = Number(miscCost) || 0;
    if (shippingCharges !== undefined) costs.shippingCharges = Number(shippingCharges) || 0;
    if (usePercentageCOGS !== undefined) costs.usePercentageCOGS = Boolean(usePercentageCOGS);
    if (cogsPercentage !== undefined) costs.cogsPercentage = Number(cogsPercentage) || 40;

    writeProductCosts(costs);
    
    console.log('[AI-Enhanced] Product costs updated:', costs);

    res.json({ success: true, costs, message: 'Product costs updated successfully' });
  } catch (error) {
    console.error('Update product costs error:', error);
    res.status(500).json({ success: false, error: 'Failed to update product costs' });
  }
});

// Calculate total cost per unit (for profit analysis)
router.get('/product-costs/total', authenticate, requireAdmin, (req, res) => {
  try {
    const costs = readProductCosts();
    const totalCostPerUnit = 
      costs.productCost +
      costs.exportPrice +
      costs.packagingCost +
      costs.thankYouCardCost +
      costs.roundStickerCost +
      costs.parcelEnvelopeCost +
      costs.billPrintingCost +
      costs.miscCost +
      costs.shippingCharges;
    
    res.json({ 
      success: true, 
      costs,
      totalCostPerUnit,
      usePercentageCOGS: costs.usePercentageCOGS,
      cogsPercentage: costs.cogsPercentage
    });
  } catch (error) {
    console.error('Get total cost error:', error);
    res.status(500).json({ success: false, error: 'Failed to calculate total cost' });
  }
});

// ================================
// PER-PRODUCT COST PROFILES (NEW)
// ================================

// Default structure for product cost profiles
const defaultProductCostProfiles = {
  profiles: [],
  defaultCosts: {
    productCost: 0,
    exportPrice: 0,
    packagingCost: 0,
    thankYouCardCost: 0,
    roundStickerCost: 0,
    parcelEnvelopeCost: 0,
    billPrintingCost: 0,
    miscCost: 0,
    shippingCharges: 0
  },
  updatedAt: null
};

function ensureProductCostProfilesFile() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(PRODUCT_COST_PROFILES_FILE)) {
    fs.writeFileSync(PRODUCT_COST_PROFILES_FILE, JSON.stringify(defaultProductCostProfiles, null, 2));
  }
}

function readProductCostProfiles() {
  ensureProductCostProfilesFile();
  try {
    const data = JSON.parse(fs.readFileSync(PRODUCT_COST_PROFILES_FILE, 'utf8'));
    return { ...defaultProductCostProfiles, ...data };
  } catch (e) {
    console.error('Error reading product cost profiles:', e);
    return defaultProductCostProfiles;
  }
}

function writeProductCostProfiles(data) {
  ensureProductCostProfilesFile();
  data.updatedAt = new Date().toISOString();
  fs.writeFileSync(PRODUCT_COST_PROFILES_FILE, JSON.stringify(data, null, 2));
}

// Generate unique ID for profiles
function generateProfileId() {
  return 'pcp_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

// GET all product cost profiles
router.get('/product-cost-profiles', authenticate, requireAdmin, (req, res) => {
  try {
    const data = readProductCostProfiles();
    res.json({ success: true, profiles: data.profiles, defaultCosts: data.defaultCosts });
  } catch (error) {
    console.error('Get product cost profiles error:', error);
    res.status(500).json({ success: false, error: 'Failed to get product cost profiles' });
  }
});

// GET single product cost profile by ID
router.get('/product-cost-profiles/:id', authenticate, requireAdmin, (req, res) => {
  try {
    const data = readProductCostProfiles();
    const profile = data.profiles.find(p => p.id === req.params.id);
    if (!profile) {
      return res.status(404).json({ success: false, error: 'Profile not found' });
    }
    res.json({ success: true, profile });
  } catch (error) {
    console.error('Get product cost profile error:', error);
    res.status(500).json({ success: false, error: 'Failed to get profile' });
  }
});

// CREATE new product cost profile
router.post('/product-cost-profiles', authenticate, requireAdmin, (req, res) => {
  try {
    const {
      productName,
      productId,
      sellingPrice,
      productCost,
      exportPrice,
      packagingCost,
      thankYouCardCost,
      roundStickerCost,
      parcelEnvelopeCost,
      billPrintingCost,
      miscCost,
      shippingCharges
    } = req.body;

    if (!productName || productName.trim() === '') {
      return res.status(400).json({ success: false, error: 'Product name is required' });
    }

    const data = readProductCostProfiles();
    
    // Check for duplicate product name
    const existingProfile = data.profiles.find(p => 
      p.productName.toLowerCase() === productName.trim().toLowerCase()
    );
    if (existingProfile) {
      return res.status(400).json({ success: false, error: 'A cost profile for this product already exists' });
    }

    const newProfile = {
      id: generateProfileId(),
      productName: productName.trim(),
      productId: productId || null,
      sellingPrice: Number(sellingPrice) || 0,
      productCost: Number(productCost) || 0,
      exportPrice: Number(exportPrice) || 0,
      packagingCost: Number(packagingCost) || 0,
      thankYouCardCost: Number(thankYouCardCost) || 0,
      roundStickerCost: Number(roundStickerCost) || 0,
      parcelEnvelopeCost: Number(parcelEnvelopeCost) || 0,
      billPrintingCost: Number(billPrintingCost) || 0,
      miscCost: Number(miscCost) || 0,
      shippingCharges: Number(shippingCharges) || 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    // Calculate total cost and profit margin
    newProfile.totalCost = newProfile.productCost + newProfile.exportPrice + 
                           newProfile.packagingCost + newProfile.thankYouCardCost + 
                           newProfile.roundStickerCost + newProfile.parcelEnvelopeCost + 
                           newProfile.billPrintingCost + newProfile.miscCost + 
                           newProfile.shippingCharges;
    newProfile.profitPerUnit = newProfile.sellingPrice - newProfile.totalCost;
    newProfile.profitMargin = newProfile.sellingPrice > 0 
      ? ((newProfile.profitPerUnit / newProfile.sellingPrice) * 100).toFixed(2)
      : 0;

    data.profiles.push(newProfile);
    writeProductCostProfiles(data);

    console.log('[AI-Enhanced] Product cost profile created:', newProfile.productName);
    res.json({ success: true, profile: newProfile, message: 'Product cost profile created successfully' });
  } catch (error) {
    console.error('Create product cost profile error:', error);
    res.status(500).json({ success: false, error: 'Failed to create profile' });
  }
});

// Update default costs (fallback for products without profiles)
// IMPORTANT: This route MUST be before /product-cost-profiles/:id to avoid :id matching "defaults"
router.put('/product-cost-profiles/defaults', authenticate, requireAdmin, (req, res) => {
  try {
    const {
      productCost,
      exportPrice,
      packagingCost,
      thankYouCardCost,
      roundStickerCost,
      parcelEnvelopeCost,
      billPrintingCost,
      miscCost,
      shippingCharges
    } = req.body;

    const data = readProductCostProfiles();
    
    if (productCost !== undefined) data.defaultCosts.productCost = Number(productCost) || 0;
    if (exportPrice !== undefined) data.defaultCosts.exportPrice = Number(exportPrice) || 0;
    if (packagingCost !== undefined) data.defaultCosts.packagingCost = Number(packagingCost) || 0;
    if (thankYouCardCost !== undefined) data.defaultCosts.thankYouCardCost = Number(thankYouCardCost) || 0;
    if (roundStickerCost !== undefined) data.defaultCosts.roundStickerCost = Number(roundStickerCost) || 0;
    if (parcelEnvelopeCost !== undefined) data.defaultCosts.parcelEnvelopeCost = Number(parcelEnvelopeCost) || 0;
    if (billPrintingCost !== undefined) data.defaultCosts.billPrintingCost = Number(billPrintingCost) || 0;
    if (miscCost !== undefined) data.defaultCosts.miscCost = Number(miscCost) || 0;
    if (shippingCharges !== undefined) data.defaultCosts.shippingCharges = Number(shippingCharges) || 0;

    writeProductCostProfiles(data);
    
    res.json({ success: true, defaultCosts: data.defaultCosts, message: 'Default costs updated successfully' });
  } catch (error) {
    console.error('Update default costs error:', error);
    res.status(500).json({ success: false, error: 'Failed to update default costs' });
  }
});

// UPDATE product cost profile
router.put('/product-cost-profiles/:id', authenticate, requireAdmin, (req, res) => {
  try {
    const { id } = req.params;
    const {
      productName,
      productId,
      sellingPrice,
      productCost,
      exportPrice,
      packagingCost,
      thankYouCardCost,
      roundStickerCost,
      parcelEnvelopeCost,
      billPrintingCost,
      miscCost,
      shippingCharges
    } = req.body;

    const data = readProductCostProfiles();
    const profileIndex = data.profiles.findIndex(p => p.id === id);
    
    if (profileIndex === -1) {
      return res.status(404).json({ success: false, error: 'Profile not found' });
    }

    // Check for duplicate product name (excluding current profile)
    if (productName) {
      const duplicateProfile = data.profiles.find(p => 
        p.id !== id && p.productName.toLowerCase() === productName.trim().toLowerCase()
      );
      if (duplicateProfile) {
        return res.status(400).json({ success: false, error: 'A cost profile for this product already exists' });
      }
    }

    const profile = data.profiles[profileIndex];
    
    // Update fields
    if (productName !== undefined) profile.productName = productName.trim();
    if (productId !== undefined) profile.productId = productId;
    if (sellingPrice !== undefined) profile.sellingPrice = Number(sellingPrice) || 0;
    if (productCost !== undefined) profile.productCost = Number(productCost) || 0;
    if (exportPrice !== undefined) profile.exportPrice = Number(exportPrice) || 0;
    if (packagingCost !== undefined) profile.packagingCost = Number(packagingCost) || 0;
    if (thankYouCardCost !== undefined) profile.thankYouCardCost = Number(thankYouCardCost) || 0;
    if (roundStickerCost !== undefined) profile.roundStickerCost = Number(roundStickerCost) || 0;
    if (parcelEnvelopeCost !== undefined) profile.parcelEnvelopeCost = Number(parcelEnvelopeCost) || 0;
    if (billPrintingCost !== undefined) profile.billPrintingCost = Number(billPrintingCost) || 0;
    if (miscCost !== undefined) profile.miscCost = Number(miscCost) || 0;
    if (shippingCharges !== undefined) profile.shippingCharges = Number(shippingCharges) || 0;
    
    profile.updatedAt = new Date().toISOString();

    // Recalculate totals
    profile.totalCost = profile.productCost + profile.exportPrice + 
                        profile.packagingCost + profile.thankYouCardCost + 
                        profile.roundStickerCost + profile.parcelEnvelopeCost + 
                        profile.billPrintingCost + profile.miscCost + 
                        profile.shippingCharges;
    profile.profitPerUnit = profile.sellingPrice - profile.totalCost;
    profile.profitMargin = profile.sellingPrice > 0 
      ? ((profile.profitPerUnit / profile.sellingPrice) * 100).toFixed(2)
      : 0;

    data.profiles[profileIndex] = profile;
    writeProductCostProfiles(data);

    console.log('[AI-Enhanced] Product cost profile updated:', profile.productName);
    res.json({ success: true, profile, message: 'Product cost profile updated successfully' });
  } catch (error) {
    console.error('Update product cost profile error:', error);
    res.status(500).json({ success: false, error: 'Failed to update profile' });
  }
});

// DELETE product cost profile
router.delete('/product-cost-profiles/:id', authenticate, requireAdmin, (req, res) => {
  try {
    const { id } = req.params;
    const data = readProductCostProfiles();
    const profileIndex = data.profiles.findIndex(p => p.id === id);
    
    if (profileIndex === -1) {
      return res.status(404).json({ success: false, error: 'Profile not found' });
    }

    const deletedProfile = data.profiles.splice(profileIndex, 1)[0];
    writeProductCostProfiles(data);

    console.log('[AI-Enhanced] Product cost profile deleted:', deletedProfile.productName);
    res.json({ success: true, message: 'Product cost profile deleted successfully' });
  } catch (error) {
    console.error('Delete product cost profile error:', error);
    res.status(500).json({ success: false, error: 'Failed to delete profile' });
  }
});

// GET cost for a specific product by name (for profit calculation)
router.get('/product-cost-profiles/by-name/:productName', authenticate, requireAdmin, (req, res) => {
  try {
    const productName = decodeURIComponent(req.params.productName);
    const data = readProductCostProfiles();
    
    // Try exact match first
    let profile = data.profiles.find(p => 
      p.productName.toLowerCase() === productName.toLowerCase()
    );
    
    // If no exact match, try partial match
    if (!profile) {
      profile = data.profiles.find(p => 
        productName.toLowerCase().includes(p.productName.toLowerCase()) ||
        p.productName.toLowerCase().includes(productName.toLowerCase())
      );
    }
    
    if (profile) {
      res.json({ success: true, profile, matched: true });
    } else {
      // Return default costs if no profile found
      res.json({ success: true, profile: data.defaultCosts, matched: false });
    }
  } catch (error) {
    console.error('Get product cost by name error:', error);
    res.status(500).json({ success: false, error: 'Failed to get product cost' });
  }
});

// ============================================================================
// SITE BACKUP & DOWNLOAD - Download entire website as ZIP
// ============================================================================

const archiver = require('archiver');

// Get backup status/info
router.get('/backup/info', authenticate, requireAdmin, (req, res) => {
  try {
    const projectRoot = path.join(__dirname, '..', '..');
    const backendDir = path.join(projectRoot, 'backend');
    const frontendDir = path.join(projectRoot, 'frontend');
    
    // Calculate approximate sizes
    const getDirectorySize = (dirPath) => {
      let totalSize = 0;
      try {
        const files = fs.readdirSync(dirPath);
        for (const file of files) {
          const filePath = path.join(dirPath, file);
          const stats = fs.statSync(filePath);
          if (stats.isDirectory()) {
            // Skip node_modules and large directories
            if (file !== 'node_modules' && file !== '.git') {
              totalSize += getDirectorySize(filePath);
            }
          } else {
            totalSize += stats.size;
          }
        }
      } catch (e) {
        // Ignore permission errors
      }
      return totalSize;
    };
    
    const backendSize = getDirectorySize(backendDir);
    const frontendSize = getDirectorySize(frontendDir);
    const totalSize = backendSize + frontendSize;
    
    // Format size
    const formatSize = (bytes) => {
      if (bytes < 1024) return bytes + ' B';
      if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
      if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
      return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
    };
    
    res.json({
      success: true,
      info: {
        backendSize: formatSize(backendSize),
        frontendSize: formatSize(frontendSize),
        totalSize: formatSize(totalSize),
        totalBytes: totalSize,
        estimatedZipSize: formatSize(Math.round(totalSize * 0.3)), // Compression estimate
        lastBackup: null,
        serverTime: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Backup info error:', error);
    res.status(500).json({ success: false, error: 'Failed to get backup info' });
  }
});

// Download full site backup as ZIP
router.get('/backup/download', authenticate, requireAdmin, async (req, res) => {
  try {
    const projectRoot = path.join(__dirname, '..', '..');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = `BLACKONN-backup-${timestamp}.zip`;
    
    // Set headers for file download
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('X-Backup-Timestamp', timestamp);
    
    // Create archive
    const archive = archiver('zip', {
      zlib: { level: 6 } // Balanced compression
    });
    
    // Handle archive errors
    archive.on('error', (err) => {
      console.error('Archive error:', err);
      if (!res.headersSent) {
        res.status(500).json({ success: false, error: 'Backup failed' });
      }
    });
    
    // Pipe archive to response
    archive.pipe(res);
    
    // Directories/files to exclude
    const excludePatterns = [
      'node_modules/**',
      '.git/**',
      '*.log',
      '*.sqlite3-shm',
      '*.sqlite3-wal',
      'npm-debug.log*',
      '.env.local',
      '.DS_Store',
      'Thumbs.db'
    ];
    
    // Add backend directory
    archive.directory(path.join(projectRoot, 'backend'), 'backend', (entry) => {
      // Exclude node_modules and git
      if (entry.name.includes('node_modules') || entry.name.includes('.git')) {
        return false;
      }
      return entry;
    });
    
    // Add frontend directory
    archive.directory(path.join(projectRoot, 'frontend'), 'frontend', (entry) => {
      if (entry.name.includes('node_modules') || entry.name.includes('.git')) {
        return false;
      }
      return entry;
    });
    
    // Add deploy directory if exists
    const deployDir = path.join(projectRoot, 'deploy');
    if (fs.existsSync(deployDir)) {
      archive.directory(deployDir, 'deploy');
    }
    
    // Add root config files
    const rootFiles = ['package.json', 'ecosystem.config.js', 'repair-system.js', '.env.example', 'README.md'];
    for (const file of rootFiles) {
      const filePath = path.join(projectRoot, file);
      if (fs.existsSync(filePath)) {
        archive.file(filePath, { name: file });
      }
    }
    
    // Finalize archive
    await archive.finalize();
    
    console.log(`[BACKUP] Site backup downloaded: ${filename}`);
  } catch (error) {
    console.error('Backup download error:', error);
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: 'Backup download failed: ' + error.message });
    }
  }
});

// Download specific folder (backend, frontend, or data)
router.get('/backup/download/:folder', authenticate, requireAdmin, async (req, res) => {
  try {
    const { folder } = req.params;
    const projectRoot = path.join(__dirname, '..', '..');
    
    let targetDir;
    if (folder === 'backend') {
      targetDir = path.join(projectRoot, 'backend');
    } else if (folder === 'frontend') {
      targetDir = path.join(projectRoot, 'frontend');
    } else if (folder === 'data') {
      targetDir = path.join(projectRoot, 'backend', 'data');
    } else if (folder === 'deploy') {
      targetDir = path.join(projectRoot, 'deploy');
    } else {
      return res.status(400).json({ success: false, error: 'Invalid folder. Use: backend, frontend, data, or deploy' });
    }
    
    if (!fs.existsSync(targetDir)) {
      return res.status(404).json({ success: false, error: 'Folder not found' });
    }
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = `BLACKONN-${folder}-${timestamp}.zip`;
    
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    
    const archive = archiver('zip', { zlib: { level: 6 } });
    
    archive.on('error', (err) => {
      console.error('Archive error:', err);
      if (!res.headersSent) {
        res.status(500).json({ success: false, error: 'Backup failed' });
      }
    });
    
    archive.pipe(res);
    
    archive.directory(targetDir, folder, (entry) => {
      if (entry.name.includes('node_modules') || entry.name.includes('.git')) {
        return false;
      }
      return entry;
    });
    
    await archive.finalize();
    
    console.log(`[BACKUP] ${folder} backup downloaded: ${filename}`);
  } catch (error) {
    console.error('Folder backup error:', error);
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: 'Backup failed: ' + error.message });
    }
  }
});

module.exports = router;
