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

// AI Middleware
router.use(aiRequestLogger);
router.use(aiPerformanceMonitor(500));

// Data file path
const DATA_DIR = path.join(__dirname, '..', 'data');
const SETTINGS_FILE = path.join(DATA_DIR, 'adminSettings.json');
const MARKETING_FILE = path.join(DATA_DIR, 'marketing.json');

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
    companyTax: { enabled: true, name: 'Company Tax' }
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
      sections: { ...defaultSettings.sections, ...data.sections }
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
    const settings = readSettings();
    res.json({ success: true, settings });
  } catch (error) {
    console.error('Get settings error:', error);
    res.status(500).json({ success: false, error: 'Failed to get settings' });
  }
});

// Get public section visibility (no auth - for frontend to check which sections are enabled)
router.get('/sections/visibility', (req, res) => {
  try {
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

module.exports = router;
