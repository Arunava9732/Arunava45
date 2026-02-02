/**
 * Cart Routes
 */

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../utils/database');
const { authenticate, optionalAuth } = require('../middleware/auth');
const { validators, validateRequest } = require('../middleware/security');
const { body, param } = require('express-validator');
const { aiRequestLogger, aiPerformanceMonitor } = require('../middleware/aiEnhancer');

const router = express.Router();

// AI Middleware
router.use(aiRequestLogger);
router.use(aiPerformanceMonitor(500));

// Get cart
router.get('/', authenticate, (req, res) => {
  try {
    const carts = db.carts.findAll();
    const cart = carts[req.user.id] || [];
    
    // Calculate totals
    const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const itemCount = cart.reduce((sum, item) => sum + item.quantity, 0);

    res.json({ 
      success: true, 
      cart, 
      subtotal,
      itemCount
    });
  } catch (error) {
    console.error('Get cart error:', error);
    res.status(500).json({ success: false, error: 'Failed to get cart' });
  }
});

// Add to cart - with input validation
router.post('/add', 
  authenticate,
  validateRequest([
    body('productId').trim().notEmpty().withMessage('Product ID is required'),
    body('quantity').optional().isInt({ min: 1, max: 100 }).withMessage('Quantity must be between 1 and 100'),
    body('selectedSize').optional().trim().isLength({ max: 20 }),
    body('selectedColor').optional().trim().isLength({ max: 50 })
  ]),
  (req, res) => {
  try {
    const { productId, quantity, selectedSize, selectedColor, name, price, image, thumbImage } = req.body;

    // Try to get product from database, or use provided data
    let product = db.products.findById(productId);
    
    // If product not found in DB, use the provided data (for dynamic products)
    if (!product) {
      product = {
        id: productId,
        name: name || 'Product',
        price: price || 999,
        image: image || thumbImage || '',
        color: selectedColor,
        size: selectedSize
      };
    }

    // Get current cart
    const carts = db.carts.findAll();
    let cart = carts[req.user.id] || [];

    // Check if item already exists with same size and color
    const existingIndex = cart.findIndex(
      item => item.id === productId && 
              item.selectedSize === (selectedSize || 'M') && 
              item.selectedColor === (selectedColor || product.color)
    );

    if (existingIndex > -1) {
      cart[existingIndex].quantity += (quantity || 1);
    } else {
      cart.push({
        id: product.id || productId,
        name: name || product.name,
        price: price || product.price,
        image: image || product.image,
        thumbImage: thumbImage || image || product.thumbImage || product.image,
        color: product.color,
        size: product.size,
        selectedSize: selectedSize || 'M',
        selectedColor: selectedColor || product.color,
        quantity: quantity || 1,
        addedAt: new Date().toISOString()
      });
    }

    // Save cart
    carts[req.user.id] = cart;
    db.carts.replaceAll(carts);

    console.log(`[AI-Enhanced] Cart item added: User ${req.user.id}, Product ${productId}`);

    const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const itemCount = cart.reduce((sum, item) => sum + item.quantity, 0);

    res.json({ 
      success: true, 
      cart, 
      subtotal,
      itemCount,
      message: 'Added to cart'
    });
  } catch (error) {
    console.error('Add to cart error:', error);
    res.status(500).json({ success: false, error: 'Failed to add to cart' });
  }
});

// Update cart item
router.put('/item/:index', authenticate, (req, res) => {
  try {
    const index = parseInt(req.params.index);
    const { quantity } = req.body;

    const carts = db.carts.findAll();
    let cart = carts[req.user.id] || [];

    if (index < 0 || index >= cart.length) {
      return res.status(404).json({ success: false, error: 'Item not found' });
    }

    if (quantity <= 0) {
      // Remove item
      cart.splice(index, 1);
    } else {
      // Check stock
      const product = db.products.findById(cart[index].id);
      if (product && quantity > (product.stock || 0)) {
        return res.status(400).json({ success: false, error: 'Insufficient stock' });
      }
      cart[index].quantity = quantity;
    }

    carts[req.user.id] = cart;
    db.carts.replaceAll(carts);

    const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const itemCount = cart.reduce((sum, item) => sum + item.quantity, 0);

    res.json({ 
      success: true, 
      cart, 
      subtotal,
      itemCount
    });
  } catch (error) {
    console.error('Update cart error:', error);
    res.status(500).json({ success: false, error: 'Failed to update cart' });
  }
});

// Remove from cart
router.delete('/item/:index', authenticate, (req, res) => {
  try {
    const index = parseInt(req.params.index);

    const carts = db.carts.findAll();
    let cart = carts[req.user.id] || [];

    if (index < 0 || index >= cart.length) {
      return res.status(404).json({ success: false, error: 'Item not found' });
    }

    cart.splice(index, 1);

    carts[req.user.id] = cart;
    db.carts.replaceAll(carts);

    const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const itemCount = cart.reduce((sum, item) => sum + item.quantity, 0);

    res.json({ 
      success: true, 
      cart, 
      subtotal,
      itemCount
    });
  } catch (error) {
    console.error('Remove from cart error:', error);
    res.status(500).json({ success: false, error: 'Failed to remove from cart' });
  }
});

// Clear cart
router.delete('/', authenticate, (req, res) => {
  try {
    const carts = db.carts.findAll();
    carts[req.user.id] = [];
    db.carts.replaceAll(carts);

    res.json({ success: true, cart: [], subtotal: 0, itemCount: 0 });
  } catch (error) {
    console.error('Clear cart error:', error);
    res.status(500).json({ success: false, error: 'Failed to clear cart' });
  }
});

// Sync cart (merge local cart with server cart)
router.post('/sync', authenticate, (req, res) => {
  try {
    const { localCart } = req.body;

    if (!Array.isArray(localCart)) {
      return res.status(400).json({ success: false, error: 'Invalid cart data' });
    }

    const carts = db.carts.findAll();
    let serverCart = carts[req.user.id] || [];

    // Merge carts (add local items that don't exist on server)
    localCart.forEach(localItem => {
      const existingIndex = serverCart.findIndex(
        item => item.id === localItem.id && 
                item.selectedSize === localItem.selectedSize && 
                item.selectedColor === localItem.selectedColor
      );

      if (existingIndex > -1) {
        // Update quantity to max of both
        serverCart[existingIndex].quantity = Math.max(
          serverCart[existingIndex].quantity,
          localItem.quantity
        );
      } else {
        serverCart.push({
          ...localItem,
          addedAt: new Date().toISOString()
        });
      }
    });

    carts[req.user.id] = serverCart;
    db.carts.replaceAll(carts);

    const subtotal = serverCart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const itemCount = serverCart.reduce((sum, item) => sum + item.quantity, 0);

    res.json({ 
      success: true, 
      cart: serverCart, 
      subtotal,
      itemCount
    });
  } catch (error) {
    console.error('Sync cart error:', error);
    res.status(500).json({ success: false, error: 'Failed to sync cart' });
  }
});

// Add gift card to cart
router.post('/add-gift-card', authenticate, (req, res) => {
  try {
    const { value, recipientName, recipientEmail, message, isGift } = req.body;
    
    // Validate amount
    const amount = parseInt(value);
    if (!amount || amount < 100 || amount > 50000) {
      return res.status(400).json({ 
        success: false, 
        error: 'Gift card value must be between ₹100 and ₹50,000' 
      });
    }
    
    // Get current cart
    const carts = db.carts.findAll();
    let cart = carts[req.user.id] || [];
    
    // Create gift card cart item
    const giftCardItem = {
      id: 'gc_' + Date.now(),
      type: 'gift-card',
      name: 'BLACKONN Gift Card',
      price: amount,
      quantity: 1,
      image: '/assets/img/gift-card-preview.png',
      selectedSize: 'Digital',
      selectedColor: 'Gift Card',
      recipientName: recipientName || 'Self',
      recipientEmail: recipientEmail || req.user.email,
      message: message || '',
      isGift: !!isGift,
      addedAt: new Date().toISOString()
    };
    
    cart.push(giftCardItem);
    carts[req.user.id] = cart;
    db.carts.replaceAll(carts);
    
    const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const itemCount = cart.reduce((sum, item) => sum + item.quantity, 0);

    res.json({ 
      success: true, 
      message: 'Gift card added to cart',
      cart,
      subtotal,
      itemCount
    });
  } catch (error) {
    console.error('Add gift card to cart error:', error);
    res.status(500).json({ success: false, error: 'Failed to add gift card to cart' });
  }
});

module.exports = router;
