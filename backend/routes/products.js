/**
 * Products Routes
 */

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');
const db = require('../utils/database');
const { authenticate, isAdmin, optionalAuth } = require('../middleware/auth');
const { validators, validateRequest } = require('../middleware/security');
const { body, param } = require('express-validator');
const { logAdminActivity } = require('../utils/logger');

const router = express.Router();

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
    const products = db.products.findAll();
    // Cache for 5 minutes (300 seconds)
    res.set('Cache-Control', 'public, max-age=300');
    res.json({ success: true, products });
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
    // Cache for 5 minutes (300 seconds)
    res.set('Cache-Control', 'public, max-age=300');
    res.json({ success: true, product });
  } catch (error) {
    console.error('Get product error:', error);
    res.status(500).json({ success: false, error: 'Failed to get product' });
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
    
    // Cache for 5 minutes (300 seconds)
    res.set('Cache-Control', 'public, max-age=300');
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
    const { name, price, color, size, description, stock, stockStatus, isOutOfStock, position, image, thumbImages, availableColors, availableSizes } = req.body;

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
      description: description ? description.trim() : '',
      stock: Number(stock) || 0,
      stockStatus: stockStatus || 'in-stock',
      isOutOfStock: isOutOfStock === true || stockStatus === 'out-of-stock',
      availableColors: availableColors || [],
      availableSizes: availableSizes || [],
      position: assignedPosition,
      image: image || '',
      thumbImages: thumbImages || [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    db.products.create(product);
    logAdminActivity(req.user.id, 'CREATE_PRODUCT', { productId: product.id, name: product.name });

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
    const { name, price, color, size, description, stock, stockStatus, isOutOfStock, position, image, thumbImages, availableColors, availableSizes } = req.body;

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
      description: description !== undefined ? description : existing.description,
      stock: stock !== undefined ? Number(stock) : existing.stock,
      stockStatus: newStockStatus || 'in-stock',
      isOutOfStock: newIsOutOfStock,
      availableColors: availableColors !== undefined ? availableColors : (existing.availableColors || []),
      availableSizes: availableSizes !== undefined ? availableSizes : (existing.availableSizes || []),
      position: position !== undefined ? (position ? Number(position) : null) : existing.position,
      image: image || existing.image,
      thumbImages: thumbImages && thumbImages.length > 0 ? thumbImages : existing.thumbImages,
      updatedAt: new Date().toISOString()
    };

    const updated = db.products.update(req.params.id, updates);
    logAdminActivity(req.user.id, 'UPDATE_PRODUCT', { productId: req.params.id, updates });

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
