/**
 * Inventory & Stock Management Routes
 * Handles SKU, barcode, stock levels, and inventory tracking
 */

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../utils/database');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { aiRequestLogger, aiPerformanceMonitor } = require('../middleware/aiEnhancer');
const pythonBridge = require('../utils/python_bridge');

const router = express.Router();

// AI Middleware
router.use(aiRequestLogger);
router.use(aiPerformanceMonitor(500));

// ===============================
// SKU & BARCODE MANAGEMENT
// ===============================

// Generate unique SKU
function generateSKU(productName, category = 'GEN') {
  const prefix = category.substring(0, 3).toUpperCase().padEnd(3, 'X');
  const namePart = productName.replace(/[^a-zA-Z0-9]/g, '').substring(0, 4).toUpperCase().padEnd(4, '0');
  const random = Math.random().toString(36).substring(2, 5).toUpperCase();
  const timestamp = Date.now().toString(36).slice(-3).toUpperCase();
  return `${prefix}-${namePart}-${random}${timestamp}`;
}

// Generate EAN-13 barcode number
function generateBarcode() {
  // Country code for India: 890
  const countryCode = '890';
  // Company prefix (5 digits) - Using a fixed one for the brand
  const companyPrefix = '74210'; 
  // Product code (4 digits)
  const productCode = Math.floor(1000 + Math.random() * 8999).toString();
  
  const baseCode = countryCode + companyPrefix + productCode;
  
  // Calculate check digit
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += parseInt(baseCode[i]) * (i % 2 === 0 ? 1 : 3);
  }
  const checkDigit = (10 - (sum % 10)) % 10;
  
  return baseCode + checkDigit;
}

// Get all products with SKU/barcode info
router.get('/sku', authenticate, requireAdmin, (req, res) => {
  try {
    const products = db.products.findAll();
    
    const skuData = products.map(p => ({
      id: p.id,
      name: p.name,
      sku: p.sku || null,
      barcode: p.barcode || null,
      price: p.price,
      stock: p.stock || 0,
      category: p.category || 'General',
      createdAt: p.createdAt,
      skuCreatedAt: p.skuCreatedAt || null,
      barcodeCreatedAt: p.barcodeCreatedAt || null,
      updatedAt: p.updatedAt
    }));
    
    res.json({ success: true, products: skuData });
  } catch (error) {
    console.error('Get SKU data error:', error);
    res.status(500).json({ success: false, error: 'Failed to get SKU data' });
  }
});

// Bulk generate SKU/barcode for all products
// IMPORTANT: This route must come BEFORE /sku/:productId to avoid route conflict
router.post('/sku/generate-all', authenticate, requireAdmin, (req, res) => {
  try {
    const products = db.products.findAll();
    const updated = [];
    const now = new Date().toISOString();
    
    products.forEach(product => {
      const updates = {};
      
      if (!product.sku) {
        updates.sku = generateSKU(product.name, product.category);
        updates.skuCreatedAt = now;
      }
      if (!product.barcode) {
        updates.barcode = generateBarcode();
        updates.barcodeCreatedAt = now;
      }
      
      if (Object.keys(updates).length > 0) {
        updates.updatedAt = now;
        db.products.update(product.id, updates);
        updated.push({ id: product.id, ...updates });
      }
    });
    
    res.json({ 
      success: true, 
      message: `Generated SKU/barcode for ${updated.length} products`,
      updated 
    });
  } catch (error) {
    console.error('Bulk generate error:', error);
    res.status(500).json({ success: false, error: 'Failed to generate SKU/barcodes' });
  }
});

// Generate/Update SKU for a product
router.post('/sku/:productId', authenticate, requireAdmin, (req, res) => {
  try {
    const { productId } = req.params;
    const { sku, category } = req.body;
    
    const product = db.products.findById(productId);
    if (!product) {
      return res.status(404).json({ success: false, error: 'Product not found' });
    }
    
    // If manual SKU provided, check for duplicates
    if (sku) {
      const existing = db.products.findAll().find(p => p.sku === sku && p.id !== productId);
      if (existing) {
        return res.status(400).json({ success: false, error: 'SKU already exists for another product' });
      }
    }
    
    // Use provided SKU or generate new one
    const newSku = sku || generateSKU(product.name, category || product.category);
    
    const updated = db.products.update(productId, { 
      sku: newSku,
      skuCreatedAt: product.skuCreatedAt || new Date().toISOString(),
      category: category || product.category,
      updatedAt: new Date().toISOString()
    });
    
    console.log(`[AI-Enhanced] SKU updated: Product ${productId}, SKU: ${newSku}`);
    
    res.json({ success: true, product: updated, sku: newSku });
  } catch (error) {
    console.error('Update SKU error:', error);
    res.status(500).json({ success: false, error: 'Failed to update SKU' });
  }
});

// Generate/Update barcode for a product
router.post('/barcode/:productId', authenticate, requireAdmin, (req, res) => {
  try {
    const { productId } = req.params;
    const { barcode } = req.body;
    
    const product = db.products.findById(productId);
    if (!product) {
      return res.status(404).json({ success: false, error: 'Product not found' });
    }

    // If manual barcode provided, check for duplicates
    if (barcode) {
      const existing = db.products.findAll().find(p => p.barcode === barcode && p.id !== productId);
      if (existing) {
        return res.status(400).json({ success: false, error: 'Barcode already exists for another product' });
      }
    }
    
    // Use provided barcode or generate new one
    const newBarcode = barcode || generateBarcode();
    
    const updated = db.products.update(productId, { 
      barcode: newBarcode,
      barcodeCreatedAt: product.barcodeCreatedAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    
    res.json({ success: true, product: updated, barcode: newBarcode });
  } catch (error) {
    console.error('Update barcode error:', error);
    res.status(500).json({ success: false, error: 'Failed to update barcode' });
  }
});

// Search by SKU or barcode
router.get('/search', authenticate, requireAdmin, (req, res) => {
  try {
    const { query } = req.query;
    
    if (!query) {
      return res.status(400).json({ success: false, error: 'Search query required' });
    }
    
    const products = db.products.findAll();
    const term = query.toLowerCase();
    
    const results = products.filter(p => 
      (p.sku && p.sku.toLowerCase().includes(term)) ||
      (p.barcode && p.barcode.includes(term)) ||
      (p.name && p.name.toLowerCase().includes(term))
    );
    
    res.json({ success: true, products: results });
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ success: false, error: 'Search failed' });
  }
});

// ===============================
// STOCK & INVENTORY MANAGEMENT
// ===============================

// Get inventory overview
router.get('/stock', authenticate, requireAdmin, (req, res) => {
  try {
    const products = db.products.findAll();
    
    const inventory = {
      totalProducts: products.length,
      totalStock: products.reduce((sum, p) => sum + (p.stock || 0), 0),
      lowStock: products.filter(p => {
        const threshold = p.lowStockThreshold || 10;
        return (p.stock || 0) > 0 && (p.stock || 0) <= threshold;
      }),
      outOfStock: products.filter(p => (p.stock || 0) === 0),
      inStock: products.filter(p => {
        const threshold = p.lowStockThreshold || 10;
        return (p.stock || 0) > threshold;
      }),
      totalValue: products.reduce((sum, p) => sum + ((p.price || 0) * (p.stock || 0)), 0),
      products: products.map(p => ({
        id: p.id,
        name: p.name,
        sku: p.sku,
        stock: p.stock || 0,
        price: p.price,
        stockStatus: p.stockStatus || (p.stock > 0 ? 'in-stock' : 'out-of-stock'),
        lastRestocked: p.lastRestocked,
        lowStockThreshold: p.lowStockThreshold || 10
      }))
    };
    
    res.json({ success: true, inventory });
  } catch (error) {
    console.error('Inventory overview error:', error);
    res.status(500).json({ success: false, error: 'Failed to get inventory' });
  }
});

// AI-Driven Stock Depletion Prediction
router.get('/predict/:productId', authenticate, requireAdmin, async (req, res) => {
  try {
    const product = db.products.findById(req.params.productId);
    if (!product) return res.status(404).json({ success: false, error: 'Product not found' });
    
    const orders = db.orders.findAll();
    
    const prediction = await pythonBridge.runPythonScript('ai_hub.py', ['ml/sales', JSON.stringify({
      product_id: product.id,
      current_stock: product.stock || 0,
      orders: orders,
      model: 'sales_predictor'
    })]);
    
    res.json({ success: true, prediction });
  } catch (error) {
    console.error('Stock prediction error:', error);
    res.status(500).json({ success: false, error: 'AI Prediction failed' });
  }
});

// Update stock for a product
router.patch('/stock/:productId', authenticate, requireAdmin, (req, res) => {
  try {
    const { productId } = req.params;
    const { stock, adjustment, reason } = req.body;
    
    const product = db.products.findById(productId);
    if (!product) {
      return res.status(404).json({ success: false, error: 'Product not found' });
    }
    
    let newStock;
    if (typeof stock === 'number') {
      newStock = Math.max(0, stock);
    } else if (typeof adjustment === 'number') {
      newStock = Math.max(0, (product.stock || 0) + adjustment);
    } else {
      return res.status(400).json({ success: false, error: 'Stock or adjustment required' });
    }
    
    // Log stock change
    const stockHistory = product.stockHistory || [];
    stockHistory.push({
      id: uuidv4(),
      previousStock: product.stock || 0,
      newStock,
      change: newStock - (product.stock || 0),
      reason: reason || 'Manual adjustment',
      timestamp: new Date().toISOString(),
      adminId: req.user.id
    });
    
    const updated = db.products.update(productId, { 
      stock: newStock,
      stockStatus: newStock > 0 ? 'in-stock' : 'out-of-stock',
      stockHistory,
      lastRestocked: newStock > (product.stock || 0) ? new Date().toISOString() : product.lastRestocked,
      updatedAt: new Date().toISOString()
    });
    
    res.json({ success: true, product: updated });
  } catch (error) {
    console.error('Update stock error:', error);
    res.status(500).json({ success: false, error: 'Failed to update stock' });
  }
});

// Bulk stock update
router.post('/stock/bulk', authenticate, requireAdmin, (req, res) => {
  try {
    const { updates } = req.body;
    
    if (!Array.isArray(updates)) {
      return res.status(400).json({ success: false, error: 'Updates array required' });
    }
    
    const results = [];
    
    updates.forEach(update => {
      const product = db.products.findById(update.productId);
      if (product) {
        const newStock = Math.max(0, update.stock);
        db.products.update(update.productId, { 
          stock: newStock,
          stockStatus: newStock > 0 ? 'in-stock' : 'out-of-stock',
          updatedAt: new Date().toISOString()
        });
        results.push({ productId: update.productId, success: true, stock: newStock });
      } else {
        results.push({ productId: update.productId, success: false, error: 'Product not found' });
      }
    });
    
    res.json({ success: true, results });
  } catch (error) {
    console.error('Bulk stock update error:', error);
    res.status(500).json({ success: false, error: 'Failed to update stock' });
  }
});

// Bulk update low stock threshold for all products
router.patch('/threshold/bulk', authenticate, requireAdmin, (req, res) => {
  try {
    const { threshold } = req.body;
    
    if (typeof threshold !== 'number' || threshold < 1) {
      return res.status(400).json({ success: false, error: 'Valid threshold required (minimum 1)' });
    }
    
    const products = db.products.findAll();
    let updatedCount = 0;
    
    products.forEach(product => {
      db.products.update(product.id, { 
        lowStockThreshold: threshold,
        updatedAt: new Date().toISOString()
      });
      updatedCount++;
    });
    
    res.json({ 
      success: true, 
      message: `Updated threshold to ${threshold} for ${updatedCount} products`,
      updatedCount 
    });
  } catch (error) {
    console.error('Bulk threshold update error:', error);
    res.status(500).json({ success: false, error: 'Failed to update thresholds' });
  }
});

// Set low stock threshold for individual product
router.patch('/threshold/:productId', authenticate, requireAdmin, (req, res) => {
  try {
    const { productId } = req.params;
    const { threshold } = req.body;
    
    const product = db.products.findById(productId);
    if (!product) {
      return res.status(404).json({ success: false, error: 'Product not found' });
    }
    
    const updated = db.products.update(productId, { 
      lowStockThreshold: Math.max(1, threshold || 10),
      updatedAt: new Date().toISOString()
    });
    
    res.json({ success: true, product: updated });
  } catch (error) {
    console.error('Update threshold error:', error);
    res.status(500).json({ success: false, error: 'Failed to update threshold' });
  }
});

// Get stock history for a product
router.get('/stock/:productId/history', authenticate, requireAdmin, (req, res) => {
  try {
    const { productId } = req.params;
    
    const product = db.products.findById(productId);
    if (!product) {
      return res.status(404).json({ success: false, error: 'Product not found' });
    }
    
    res.json({ 
      success: true, 
      product: { id: product.id, name: product.name },
      history: product.stockHistory || []
    });
  } catch (error) {
    console.error('Get stock history error:', error);
    res.status(500).json({ success: false, error: 'Failed to get stock history' });
  }
});

// Get low stock alerts
router.get('/alerts', authenticate, requireAdmin, (req, res) => {
  try {
    const products = db.products.findAll();
    
    const alerts = products
      .filter(p => {
        const threshold = p.lowStockThreshold || 10;
        return (p.stock || 0) <= threshold;
      })
      .map(p => ({
        id: p.id,
        name: p.name,
        sku: p.sku,
        stock: p.stock || 0,
        threshold: p.lowStockThreshold || 10,
        severity: (p.stock || 0) === 0 ? 'critical' : 'warning'
      }));
    
    res.json({ success: true, alerts });
  } catch (error) {
    console.error('Get alerts error:', error);
    res.status(500).json({ success: false, error: 'Failed to get alerts' });
  }
});

module.exports = router;
