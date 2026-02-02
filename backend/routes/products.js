/**
 * Products Routes - AI Enhanced
 */

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');
const db = require('../utils/database');
const { authenticate, isAdmin, optionalAuth } = require('../middleware/auth');
const { validators, validateRequest } = require('../middleware/security');
const { aiRequestLogger, aiPerformanceMonitor } = require('../middleware/aiEnhancer');
const { body, param } = require('express-validator');
const { logAdminActivity } = require('../utils/logger');
const pythonBridge = require('../utils/python_bridge');

const router = express.Router();

// Apply AI middleware
router.use(aiRequestLogger);
router.use(aiPerformanceMonitor(500)); // Alert on requests > 500ms

// Upload directory for products
const PRODUCTS_UPLOAD_DIR = path.join(__dirname, '..', 'uploads', 'products');

// Helper to delete uploaded file
function deleteUploadedFile(filePath) {
  try {
    if (!filePath) return;
    
    // Extract filename from URL path
    let filename = filePath;
    if (filePath.includes('/uploads/products/')) {
      filename = filePath.split('/uploads/products/').pop();
    } else if (filePath.includes('/api/uploads/products/')) {
      filename = filePath.split('/api/uploads/products/').pop();
    }
    
    const fullPath = path.join(PRODUCTS_UPLOAD_DIR, filename);
    
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
      console.log('Deleted file:', fullPath);
    }
  } catch (error) {
    console.error('Error deleting file:', error);
  }
}

// Get all products (public)
router.get('/', (req, res) => {
  try {
    let products = db.products.findAll();
    const { category, search, minPrice, maxPrice, sort } = req.query;

    // Filter by category
    if (category && category !== 'all') {
      products = products.filter(p => p.category === category);
    }

    // Filter by search term
    if (search) {
      const term = search.toLowerCase();
      products = products.filter(p => 
        p.name.toLowerCase().includes(term) || 
        (p.description && p.description.toLowerCase().includes(term)) ||
        (p.category && p.category.toLowerCase().includes(term))
      );
    }

    // Filter by price
    if (minPrice) products = products.filter(p => p.price >= parseFloat(minPrice));
    if (maxPrice) products = products.filter(p => p.price <= parseFloat(maxPrice));

    // Sort
    if (sort) {
      switch (sort) {
        case 'price-low': products.sort((a, b) => a.price - b.price); break;
        case 'price-high': products.sort((a, b) => b.price - a.price); break;
        case 'newest': products.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)); break;
        default: break;
      }
    }

    console.log(`[AI-PRODUCTS] Retrieved ${products.length} products (Filtered: ${!!(category || search)})`);
    // AI RECOMMENDED: Disable public caching for real-time admin updates
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.json({ success: true, products, count: products.length });
  } catch (error) {
    console.error('Get products error:', error);
    res.status(500).json({ success: false, error: 'Failed to get products' });
  }
});

// Get product by ID (public)
router.get('/:id', (req, res) => {
  try {
    const product = db.products.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ success: false, error: 'Product not found' });
    }
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.json({ success: true, product });
  } catch (error) {
    console.error('Get product error:', error);
    res.status(500).json({ success: false, error: 'Failed to get product' });
  }
});

// AI Product Recommendations using Python Bridge
router.get('/:id/recommendations', async (req, res) => {
  try {
    const product = db.products.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ success: false, error: 'Product not found' });
    }

    const allProducts = db.products.findAll();
    
    // Call Python for ML-based recommendation
    let recommendedIds = [];
    try {
      recommendedIds = await pythonBridge.runPythonScript('ai_hub.py', ['recommend/personalized', JSON.stringify({ 
        current_product: product, 
        all_products: allProducts 
      })]);
    } catch (e) {
      console.error('[AI-Recommend] Python recommendation failed:', e.message);
      // Simple fallback: same category
      recommendedIds = allProducts
        .filter(p => p.category === product.category && p.id !== product.id)
        .slice(0, 4)
        .map(p => ({ id: p.id }));
    }

    const recommendations = recommendedIds
      .map(rec => allProducts.find(p => p.id === rec.id))
      .filter(p => p !== undefined);

    res.json({ success: true, recommendations });
  } catch (error) {
    console.error('Get recommendations error:', error);
    res.status(500).json({ success: false, error: 'Failed to get recommendations' });
  }
});

// Get products by position (for homepage)
router.get('/position/:positions', (req, res) => {
  try {
    const positions = req.params.positions.split(',').map(Number);
    const allProducts = db.products.findAll();
    const filtered = allProducts
      .filter(p => positions.includes(Number(p.position)))
      .sort((a, b) => a.position - b.position);
    
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.json({ success: true, products: filtered });
  } catch (error) {
    console.error('Get products by position error:', error);
    res.status(500).json({ success: false, error: 'Failed to get products' });
  }
});

// Create product (admin only) - with input validation
router.post('/', 
  authenticate, 
  isAdmin,
  validateRequest([
    body('name').trim().notEmpty().isLength({ max: 200 }).withMessage('Name is required (max 200 characters)'),
    body('price').isNumeric().isFloat({ min: 0 }).withMessage('Price must be a positive number'),
    body('color').optional().trim().isLength({ max: 50 }),
    body('size').optional().trim().isLength({ max: 50 }),
    body('description').optional().trim().isLength({ max: 5000 }).withMessage('Description too long (max 5000 characters)'),
    body('stock').optional().isInt({ min: 0 }).withMessage('Stock must be a non-negative integer'),
    body('position').optional().isInt({ min: 1 }).withMessage('Position must be a positive integer')
  ]),
  (req, res) => {
  try {
    const { 
      name, price, color, size, description, stock, stockStatus, 
      isOutOfStock, position, image, thumbImages, availableColors, 
      availableSizes, sku, barcode, skuCreatedAt, barcodeCreatedAt,
      category
    } = req.body;

    // Auto-assign position if not provided
    let assignedPosition = position ? Number(position) : null;
    if (!assignedPosition) {
      // Get next available position
      const allProducts = db.products.findAll();
      const maxPosition = allProducts.reduce((max, p) => Math.max(max, Number(p.position) || 0), 0);
      assignedPosition = maxPosition + 1;
    }

    const product = {
      id: 'prod-' + uuidv4().slice(0, 8),
      name: name.trim(),
      price: Number(price),
      color: color ? color.trim() : '',
      size: size ? size.trim() : 'All',
      category: category || 'General',
      description: description ? description.trim() : '',
      stock: Number(stock) || 0,
      stockStatus: stockStatus || 'in-stock',
      isOutOfStock: isOutOfStock === true || stockStatus === 'out-of-stock',
      availableColors: availableColors || [],
      availableSizes: availableSizes || [],
      position: assignedPosition,
      image: image || '',
      thumbImages: thumbImages || [],
      sku: sku || '',
      barcode: barcode || '',
      skuCreatedAt: skuCreatedAt || null,
      barcodeCreatedAt: barcodeCreatedAt || null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    db.products.create(product);
    logAdminActivity(req.user.id, 'CREATE_PRODUCT', { productId: product.id, name: product.name });

    // Invalidate caches
    if (req.app.locals.invalidateCache) {
      req.app.locals.invalidateCache('/api/products');
      req.app.locals.invalidateCache('/api/seo');
    }

    // Trigger AI SEO Background Task (Automated SEO)
    try {
      pythonBridge.runPythonScript('ai_hub.py', [
        'seo/analyze',
        JSON.stringify({ products: [product], isNew: true })
      ]).catch(err => console.error('Auto SEO Error:', err));
    } catch (e) {}

    res.status(201).json({ success: true, product });
  } catch (error) {
    console.error('Create product error:', error);
    res.status(500).json({ success: false, error: 'Failed to create product' });
  }
});

// Update product (admin only)
router.put('/:id', authenticate, isAdmin, validateRequest([
  body('name').trim().notEmpty().isLength({ max: 200 }).withMessage('Name is required (max 200 characters)'),
  body('price').isNumeric().isFloat({ min: 0 }).withMessage('Price must be a positive number'),
  body('color').optional().trim().isLength({ max: 50 }),
  body('size').optional().trim().isLength({ max: 50 }),
  body('description').optional().trim().isLength({ max: 5000 }).withMessage('Description too long (max 5000 characters)'),
  body('stock').optional().isInt({ min: 0 }).withMessage('Stock must be a non-negative integer'),
  body('position').optional().isInt({ min: 1 }).withMessage('Position must be a positive integer')
]), (req, res) => {
  try {
    const { 
      name, price, color, size, description, stock, stockStatus, 
      isOutOfStock, position, image, thumbImages, availableColors, 
      availableSizes, sku, barcode, skuCreatedAt, barcodeCreatedAt,
      category
    } = req.body;

    const existing = db.products.findById(req.params.id);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Product not found' });
    }

    // Determine out of stock status
    const newStockStatus = stockStatus !== undefined ? stockStatus : existing.stockStatus;
    const newIsOutOfStock = isOutOfStock !== undefined ? isOutOfStock : (newStockStatus === 'out-of-stock');

    const updates = {
      name: name !== undefined ? name : existing.name,
      price: price !== undefined ? Number(price) : existing.price,
      color: color !== undefined ? color : existing.color,
      size: size !== undefined ? size : existing.size,
      category: category !== undefined ? category : existing.category,
      description: description !== undefined ? description : existing.description,
      stock: stock !== undefined ? Number(stock) : existing.stock,
      stockStatus: newStockStatus || 'in-stock',
      isOutOfStock: newIsOutOfStock,
      availableColors: availableColors !== undefined ? availableColors : (existing.availableColors || []),
      availableSizes: availableSizes !== undefined ? availableSizes : (existing.availableSizes || []),
      position: position !== undefined ? (position ? Number(position) : null) : existing.position,
      image: image || existing.image,
      thumbImages: thumbImages && thumbImages.length > 0 ? thumbImages : existing.thumbImages,
      sku: sku !== undefined ? sku : existing.sku,
      barcode: barcode !== undefined ? barcode : existing.barcode,
      skuCreatedAt: skuCreatedAt !== undefined ? skuCreatedAt : existing.skuCreatedAt,
      barcodeCreatedAt: barcodeCreatedAt !== undefined ? barcodeCreatedAt : existing.barcodeCreatedAt,
      updatedAt: new Date().toISOString()
    };

    const updated = db.products.update(req.params.id, updates);
    logAdminActivity(req.user.id, 'UPDATE_PRODUCT', { productId: req.params.id, updates });
    // Invalidate caches
    if (req.app.locals.invalidateCache) {
      req.app.locals.invalidateCache('/api/products');
      req.app.locals.invalidateCache('/api/seo');
    }
    // Trigger AI SEO Background Task (Automated SEO update)
    try {
      pythonBridge.runPythonScript('ai_hub.py', [
        'seo/analyze',
        JSON.stringify({ products: [updated], isUpdate: true })
      ]).catch(err => console.error('Auto SEO Error:', err));
    } catch (e) {}

    res.json({ success: true, product: updated });
  } catch (error) {
    console.error('Update product error:', error);
    res.status(500).json({ success: false, error: 'Failed to update product' });
  }
});

// Delete product (admin only)
router.delete('/:id', authenticate, isAdmin, (req, res) => {
  try {
    // Get product first to access image paths
    const product = db.products.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ success: false, error: 'Product not found' });
    }
    
    // Delete main image
    if (product.image) {
      deleteUploadedFile(product.image);
    }
    
    // Delete thumbnail images
    if (product.thumbImages && Array.isArray(product.thumbImages)) {
      product.thumbImages.forEach(img => deleteUploadedFile(img));
    }
    
    // Delete from database
    db.products.delete(req.params.id);
    logAdminActivity(req.user.id, 'DELETE_PRODUCT', { productId: req.params.id });
    
    // Invalidate caches
    if (req.app.locals.invalidateCache) {
      req.app.locals.invalidateCache('/api/products');
      req.app.locals.invalidateCache('/api/seo');
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Delete product error:', error);
    res.status(500).json({ success: false, error: 'Failed to delete product' });
  }
});

// Bulk update products (admin only)
router.put('/', authenticate, isAdmin, (req, res) => {
  try {
    const { products } = req.body;
    if (!Array.isArray(products)) {
      return res.status(400).json({ success: false, error: 'Products array is required' });
    }

    db.products.replaceAll(products);
    res.json({ success: true, message: 'Products updated', count: products.length });
  } catch (error) {
    console.error('Bulk update products error:', error);
    res.status(500).json({ success: false, error: 'Failed to update products' });
  }
});

// Update stock (admin only)
router.patch('/:id/stock', authenticate, isAdmin, (req, res) => {
  try {
    const { stock, operation } = req.body;
    const product = db.products.findById(req.params.id);
    
    if (!product) {
      return res.status(404).json({ success: false, error: 'Product not found' });
    }

    let newStock = Number(stock);
    if (operation === 'increment') {
      newStock = (product.stock || 0) + newStock;
    } else if (operation === 'decrement') {
      newStock = Math.max(0, (product.stock || 0) - newStock);
    }

    const updated = db.products.update(req.params.id, { 
      stock: newStock,
      updatedAt: new Date().toISOString()
    });

    res.json({ success: true, product: updated });
  } catch (error) {
    console.error('Update stock error:', error);
    res.status(500).json({ success: false, error: 'Failed to update stock' });
  }
});

module.exports = router;
