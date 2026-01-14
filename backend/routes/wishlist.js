/**
 * Wishlist Routes
 * Manage user wishlists - requires authentication
 */

const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const db = require('../utils/database');
const { validators, validateRequest } = require('../middleware/security');
const { body, param } = require('express-validator');
const { aiRequestLogger, aiPerformanceMonitor } = require('../middleware/aiEnhancer');

const wishlistDb = db.wishlists;

// AI Middleware
router.use(aiRequestLogger);
router.use(aiPerformanceMonitor(500));

// GET /api/wishlist - Get user's wishlist
router.get('/', authenticate, (req, res) => {
  try {
    const userId = req.user.id;
    const wishlists = wishlistDb.findAll();
    const userWishlist = wishlists[userId] || [];
    
    res.json({ success: true, wishlist: userWishlist });
  } catch (error) {
    console.error('Error fetching wishlist:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch wishlist' });
  }
});

// POST /api/wishlist - Add item to wishlist
router.post('/', authenticate, (req, res) => {
  try {
    const userId = req.user.id;
    const { productId, name, price, image, productIndex } = req.body;

    // Check for valid productId or productIndex (productIndex can be 0 which is falsy)
    if (!productId && (productIndex === undefined || productIndex === null)) {
      return res.status(400).json({ 
        success: false, 
        error: 'Product ID or index is required' 
      });
    }

    const wishlists = wishlistDb.findAll();
    if (!wishlists[userId]) {
      wishlists[userId] = [];
    }

    // Check if item already exists
    const existingIndex = wishlists[userId].findIndex(
      item => item.productId === productId || item.productIndex === productIndex
    );

    if (existingIndex !== -1) {
      return res.status(400).json({ 
        success: false, 
        error: 'Item already in wishlist' 
      });
    }

    const newItem = {
      id: `wish-${Date.now()}`,
      productId,
      productIndex,
      name,
      price,
      image,
      addedAt: new Date().toISOString()
    };

    wishlists[userId].push(newItem);
    wishlistDb._write(wishlists);

    console.log(`[AI-Enhanced] Wishlist item added: User ${userId}, Product ${productId}`);

    res.status(201).json({ success: true, item: newItem, wishlist: wishlists[userId] });
  } catch (error) {
    console.error('Error adding to wishlist:', error);
    res.status(500).json({ success: false, error: 'Failed to add to wishlist' });
  }
});

// DELETE /api/wishlist/:itemId - Remove item from wishlist
router.delete('/:itemId', authenticate, (req, res) => {
  try {
    const userId = req.user.id;
    const { itemId } = req.params;

    const wishlists = wishlistDb.findAll();
    if (!wishlists[userId]) {
      return res.status(404).json({ success: false, error: 'Wishlist not found' });
    }

    const itemIndex = wishlists[userId].findIndex(
      item => item.id === itemId || item.productId === itemId || item.productIndex == itemId
    );

    if (itemIndex === -1) {
      return res.status(404).json({ success: false, error: 'Item not found in wishlist' });
    }

    const removedItem = wishlists[userId].splice(itemIndex, 1)[0];
    wishlistDb._write(wishlists);

    console.log(`[AI-Enhanced] Wishlist item removed: User ${userId}, Item ${itemId}`);

    res.json({ success: true, message: 'Item removed from wishlist', item: removedItem });
  } catch (error) {
    console.error('Error removing from wishlist:', error);
    res.status(500).json({ success: false, error: 'Failed to remove from wishlist' });
  }
});

// DELETE /api/wishlist - Clear entire wishlist
router.delete('/', authenticate, (req, res) => {
  try {
    const userId = req.user.id;
    const wishlists = wishlistDb.findAll();
    wishlists[userId] = [];
    wishlistDb._write(wishlists);

    res.json({ success: true, message: 'Wishlist cleared' });
  } catch (error) {
    console.error('Error clearing wishlist:', error);
    res.status(500).json({ success: false, error: 'Failed to clear wishlist' });
  }
});

module.exports = router;
