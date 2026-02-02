/**
 * Reviews Page Management Routes
 * Manage all review page data including stats, reviews, platforms, partnerships, milestones
 */

const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { authenticate, isAdmin } = require('../middleware/auth');
const { Database } = require('../utils/database');
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');

// AI-OPTIMIZED: Disable caching for all reviews page data
router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  next();
});

const reviewsPageDb = new Database('reviewsPage');

// Upload directory for review photos and partner logos
const REVIEWS_UPLOAD_DIR = path.join(__dirname, '..', 'uploads', 'reviews');

// Ensure upload directory exists
if (!fs.existsSync(REVIEWS_UPLOAD_DIR)) {
  fs.mkdirSync(REVIEWS_UPLOAD_DIR, { recursive: true });
}

// Multer configuration for reviews upload
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, REVIEWS_UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, 'review-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|webp|gif/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (extname && mimetype) {
      return cb(null, true);
    }
    cb(new Error('Only images are allowed!'));
  }
});

// Helper to get default data structure
function getDefaultData() {
  return {
    settings: {
      statsEnabled: false,
      reviewsEnabled: true,
      platformsEnabled: false,
      photosEnabled: false,
      partnershipsEnabled: false,
      milestonesEnabled: false
    },
    stats: {
      averageRating: 0.0,
      happyCustomers: "0+",
      recommendUs: "0%"
    },
    megaStats: [],
    ratingBreakdown: { "5star": 0, "4star": 0, "3star": 0, "2star": 0, "1star": 0 },
    platforms: [],
    reviews: [],
    customerPhotos: [],
    partnerships: [],
    milestones: [],
    updatedAt: new Date().toISOString()
  };
}

// Helper to ensure data has valid structure
function ensureValidData(data) {
  if (!data || (Array.isArray(data) && data.length === 0) || (typeof data === 'object' && !data.stats)) {
    return getDefaultData();
  }
  return data;
}

// ============ PUBLIC ENDPOINTS ============

// GET /api/reviews-page - Get all public review page data
router.get('/', (req, res) => {
  try {
    let data = reviewsPageDb.findAll();
    
    // If data is empty array (new DB) or empty object, return default structure
    if (!data || (Array.isArray(data) && data.length === 0) || (typeof data === 'object' && !data.stats)) {
      data = getDefaultData();
    }
    
    // Filter out hidden reviews for public view
    if (data.reviews) {
      data.reviews = data.reviews.filter(r => r.status === 'visible');
    }
    
    // Filter inactive items
    if (data.customerPhotos) {
      data.customerPhotos = data.customerPhotos.filter(p => p.active !== false);
    }
    if (data.partnerships) {
      data.partnerships = data.partnerships.filter(p => p.active !== false);
    }
    if (data.platforms) {
      data.platforms = data.platforms.filter(p => p.active !== false);
    }
    
    // Include settings for frontend section visibility
    if (!data.settings) {
      data.settings = getDefaultData().settings;
    }
    
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.json({ success: true, data });
  } catch (error) {
    console.error('Error fetching reviews page data:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch reviews page data' });
  }
});

// GET /api/reviews-page/my-purchases - Get unique products purchased by user
router.get('/my-purchases', authenticate, (req, res) => {
  try {
    const ordersDb = new Database('orders');
    const orders = ordersDb.findAll();
    if (!orders || !Array.isArray(orders)) {
      return res.json({ success: true, products: [] });
    }

    // Filter orders by this user
    const userOrders = orders.filter(o => o.userId === req.user.id || o.userEmail === req.user.email);
    
    // Extract unique product names
    const productNames = new Set();
    userOrders.forEach(order => {
      if (order.items && Array.isArray(order.items)) {
        order.items.forEach(item => {
          if (item.name) productNames.add(item.name);
        });
      }
    });

    res.json({ success: true, products: Array.from(productNames) });
  } catch (error) {
    console.error('Error fetching user purchases:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch purchases' });
  }
});

// POST /api/reviews-page/upload - Admin image upload
router.post('/upload', authenticate, isAdmin, upload.single('image'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file uploaded' });
    }
    const imageUrl = `/uploads/reviews/${req.file.filename}`;
    res.json({ success: true, url: imageUrl });
  } catch (error) {
    console.error('Error in upload:', error);
    res.status(500).json({ success: false, error: 'Upload failed' });
  }
});

// POST /api/reviews-page/submit - User submit review
router.post('/submit', authenticate, upload.array('photos', 5), (req, res) => {
  try {
    const { product, rating, title, content, name, email } = req.body;
    
    if (!product || !rating || !content) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    let data = reviewsPageDb.findAll();
    if (Array.isArray(data) && data.length === 0) {
      data = getDefaultData();
    }

    const photoUrls = req.files ? req.files.map(f => `/uploads/reviews/${f.filename}`) : [];

    // Verify product was actually purchased by user for 'Verified Purchase' status
    const ordersDb = new Database('orders');
    const userOrders = ordersDb.findAll().filter(o => o.userId === req.user.id || o.userEmail === req.user.email);
    const hasPurchased = userOrders.some(order => 
      order.items && order.items.some(item => item.name === product)
    );

    if (!hasPurchased) {
      return res.status(403).json({ success: false, error: 'You can only review products you have purchased.' });
    }

    const newReview = {
      id: `review-${uuidv4().slice(0, 8)}`,
      userId: req.user.id,
      name: name || req.user.name || 'Anonymous',
      avatar: (name || req.user.name || 'A').charAt(0).toUpperCase(),
      email: email || req.user.email,
      date: new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
      rating: parseInt(rating),
      product: product,
      productIcon: 'ri-t-shirt-line', // Default
      title: title || '',
      content: content,
      helpful: 0,
      verified: true, 
      status: 'pending', 
      brandReply: null,
      photos: photoUrls,
      createdAt: new Date().toISOString()
    };

    if (!data.reviews) data.reviews = [];
    data.reviews.unshift(newReview);
    data.updatedAt = new Date().toISOString();
    
    reviewsPageDb._write(data);
    
    res.json({ 
      success: true, 
      message: 'Review submitted successfully! It will be visible after moderation.',
      review: newReview 
    });
  } catch (error) {
    console.error('Error submitting review:', error);
    res.status(500).json({ success: false, error: 'Failed to submit review' });
  }
});

// POST /api/reviews-page/reviews/:id/helpful - Increment helpful count (public)
router.post('/reviews/:id/helpful', (req, res) => {
  try {
    const { id } = req.params;
    let data = ensureValidData(reviewsPageDb.findAll());
    
    if (!data.reviews) data.reviews = [];
    const review = data.reviews.find(r => r.id === id);
    if (!review) {
      return res.status(404).json({ success: false, error: 'Review not found' });
    }
    
    review.helpful = (review.helpful || 0) + 1;
    data.updatedAt = new Date().toISOString();
    
    reviewsPageDb._write(data);
    
    res.json({ success: true, helpful: review.helpful });
  } catch (error) {
    console.error('Error updating helpful count:', error);
    res.status(500).json({ success: false, error: 'Failed to update helpful count' });
  }
});

// ============ ADMIN ENDPOINTS ============

// GET /api/reviews-page/settings - Get reviews page settings
router.get('/settings', authenticate, isAdmin, (req, res) => {
  try {
    let data = reviewsPageDb.findAll();
    if (!data || (Array.isArray(data) && data.length === 0) || (typeof data === 'object' && !data.stats)) {
      data = getDefaultData();
    }
    res.json({ success: true, settings: data.settings || getDefaultData().settings });
  } catch (error) {
    console.error('Get reviews settings error:', error);
    res.status(500).json({ success: false, error: 'Failed to get settings' });
  }
});

// PATCH /api/reviews-page/settings - Update reviews page settings
router.patch('/settings', authenticate, isAdmin, (req, res) => {
  try {
    let data = reviewsPageDb.findAll();
    if (!data || (Array.isArray(data) && data.length === 0) || (typeof data === 'object' && !data.stats)) {
      data = getDefaultData();
    }
    
    if (!data.settings) data.settings = getDefaultData().settings;
    
    const { statsEnabled, reviewsEnabled, platformsEnabled, photosEnabled, partnershipsEnabled, milestonesEnabled } = req.body;
    
    if (typeof statsEnabled === 'boolean') data.settings.statsEnabled = statsEnabled;
    if (typeof reviewsEnabled === 'boolean') data.settings.reviewsEnabled = reviewsEnabled;
    if (typeof platformsEnabled === 'boolean') data.settings.platformsEnabled = platformsEnabled;
    if (typeof photosEnabled === 'boolean') data.settings.photosEnabled = photosEnabled;
    if (typeof partnershipsEnabled === 'boolean') data.settings.partnershipsEnabled = partnershipsEnabled;
    if (typeof milestonesEnabled === 'boolean') data.settings.milestonesEnabled = milestonesEnabled;
    
    data.updatedAt = new Date().toISOString();
    reviewsPageDb._write(data);
    
    res.json({ success: true, settings: data.settings });
  } catch (error) {
    console.error('Update reviews settings error:', error);
    res.status(500).json({ success: false, error: 'Failed to update settings' });
  }
});

// GET /api/reviews-page/admin - Get all data including hidden (admin only)
router.get('/admin', authenticate, isAdmin, (req, res) => {
  try {
    let data = reviewsPageDb.findAll();
    
    if (!data || (Array.isArray(data) && data.length === 0) || (typeof data === 'object' && !data.stats)) {
      data = getDefaultData();
    }
    
    res.json({ success: true, data });
  } catch (error) {
    console.error('Error fetching admin reviews data:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch data' });
  }
});

// PUT /api/reviews-page/stats - Update stats (admin only)
router.put('/stats', authenticate, isAdmin, (req, res) => {
  try {
    const { averageRating, happyCustomers, recommendUs, totalReviewsText } = req.body;
    
    let data = ensureValidData(reviewsPageDb.findAll());
    
    data.stats = {
      averageRating: averageRating || data.stats?.averageRating || 0.0,
      happyCustomers: happyCustomers || data.stats?.happyCustomers || "0",
      recommendUs: recommendUs || data.stats?.recommendUs || "0%",
      totalReviewsText: totalReviewsText || data.stats?.totalReviewsText || "No reviews yet"
    };
    data.updatedAt = new Date().toISOString();
    
    reviewsPageDb._write(data);
    
    res.json({ success: true, message: 'Stats updated', stats: data.stats });
  } catch (error) {
    console.error('Error updating stats:', error);
    res.status(500).json({ success: false, error: 'Failed to update stats' });
  }
});

// PUT /api/reviews-page/rating-breakdown - Update rating breakdown (admin only)
router.put('/rating-breakdown', authenticate, isAdmin, (req, res) => {
  try {
    const breakdown = req.body;
    
    let data = ensureValidData(reviewsPageDb.findAll());
    
    data.ratingBreakdown = {
      "5star": breakdown["5star"] ?? data.ratingBreakdown?.["5star"] ?? 78,
      "4star": breakdown["4star"] ?? data.ratingBreakdown?.["4star"] ?? 15,
      "3star": breakdown["3star"] ?? data.ratingBreakdown?.["3star"] ?? 5,
      "2star": breakdown["2star"] ?? data.ratingBreakdown?.["2star"] ?? 1,
      "1star": breakdown["1star"] ?? data.ratingBreakdown?.["1star"] ?? 1
    };
    data.updatedAt = new Date().toISOString();
    
    reviewsPageDb._write(data);
    
    res.json({ success: true, message: 'Rating breakdown updated', ratingBreakdown: data.ratingBreakdown });
  } catch (error) {
    console.error('Error updating rating breakdown:', error);
    res.status(500).json({ success: false, error: 'Failed to update rating breakdown' });
  }
});

// ============ MEGA STATS ============

// PUT /api/reviews-page/mega-stats - Update all mega stats (admin only)
router.put('/mega-stats', authenticate, isAdmin, (req, res) => {
  try {
    const { megaStats } = req.body;
    
    if (!Array.isArray(megaStats)) {
      return res.status(400).json({ success: false, error: 'megaStats must be an array' });
    }
    
    let data = reviewsPageDb.findAll();
    if (Array.isArray(data) && data.length === 0) {
      data = getDefaultData();
    }
    
    data.megaStats = megaStats.map((stat, index) => ({
      id: stat.id || `mega-${index + 1}`,
      icon: stat.icon || 'ri-bar-chart-line',
      number: stat.number || '0',
      label: stat.label || 'Stat'
    }));
    data.updatedAt = new Date().toISOString();
    
    reviewsPageDb._write(data);
    
    res.json({ success: true, message: 'Mega stats updated', megaStats: data.megaStats });
  } catch (error) {
    console.error('Error updating mega stats:', error);
    res.status(500).json({ success: false, error: 'Failed to update mega stats' });
  }
});

// ============ PLATFORMS ============

// PUT /api/reviews-page/platforms - Update platforms (admin only)
router.put('/platforms', authenticate, isAdmin, (req, res) => {
  try {
    const { platforms } = req.body;
    
    if (!Array.isArray(platforms)) {
      return res.status(400).json({ success: false, error: 'platforms must be an array' });
    }
    
    let data = reviewsPageDb.findAll();
    if (Array.isArray(data) && data.length === 0) {
      data = getDefaultData();
    }
    
    data.platforms = platforms.map((platform, index) => ({
      id: platform.id || `platform-${index + 1}`,
      name: platform.name || 'Platform',
      icon: platform.icon || 'ri-star-line',
      colorClass: platform.colorClass || 'default',
      rating: platform.rating || 5.0,
      count: platform.count || '0 reviews',
      active: platform.active !== false
    }));
    data.updatedAt = new Date().toISOString();
    
    reviewsPageDb._write(data);
    
    res.json({ success: true, message: 'Platforms updated', platforms: data.platforms });
  } catch (error) {
    console.error('Error updating platforms:', error);
    res.status(500).json({ success: false, error: 'Failed to update platforms' });
  }
});

// ============ REVIEWS MANAGEMENT ============

// GET /api/reviews-page/reviews - Get all reviews (admin only)
router.get('/reviews', authenticate, isAdmin, (req, res) => {
  try {
    let data = reviewsPageDb.findAll();
    if (Array.isArray(data) && data.length === 0) {
      data = getDefaultData();
    }
    
    res.json({ success: true, reviews: data.reviews || [] });
  } catch (error) {
    console.error('Error fetching reviews:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch reviews' });
  }
});

// POST /api/reviews-page/reviews - Add new review (admin only)
router.post('/reviews', authenticate, isAdmin, (req, res) => {
  try {
    const { name, avatar, date, rating, product, productIcon, content, verified } = req.body;
    
    if (!name || !content || !rating) {
      return res.status(400).json({ success: false, error: 'Name, content, and rating are required' });
    }
    
    let data = reviewsPageDb.findAll();
    if (Array.isArray(data) && data.length === 0) {
      data = getDefaultData();
    }
    
    const newReview = {
      id: `review-${uuidv4().slice(0, 8)}`,
      name,
      avatar: avatar || name.charAt(0).toUpperCase(),
      date: date || new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
      rating: parseInt(rating),
      product: product || '',
      productIcon: productIcon || 'ri-t-shirt-line',
      content,
      helpful: 0,
      verified: verified !== false,
      status: 'visible',
      brandReply: null,
      createdAt: new Date().toISOString()
    };
    
    if (!data.reviews) data.reviews = [];
    data.reviews.unshift(newReview);
    data.updatedAt = new Date().toISOString();
    
    reviewsPageDb._write(data);
    
    res.json({ success: true, message: 'Review added', review: newReview });
  } catch (error) {
    console.error('Error adding review:', error);
    res.status(500).json({ success: false, error: 'Failed to add review' });
  }
});

// POST /api/reviews-page/reviews/:id/helpful - Increment helpful count (public)
router.post('/reviews/:id/helpful', (req, res) => {
  try {
    const { id } = req.params;
    let data = reviewsPageDb.findAll();
    if (Array.isArray(data) && data.length === 0) {
      data = getDefaultData();
    }
    
    if (!data.reviews) data.reviews = [];
    const review = data.reviews.find(r => r.id === id);
    
    if (!review) {
      return res.status(404).json({ success: false, error: 'Review not found' });
    }
    
    review.helpful = (parseInt(review.helpful) || 0) + 1;
    reviewsPageDb._write(data);
    
    res.json({ success: true, helpful: review.helpful });
  } catch (error) {
    console.error('Error incrementing helpful count:', error);
    res.status(500).json({ success: false, error: 'Failed to update helpful count' });
  }
});

// PUT /api/reviews-page/reviews/:id - Update review (admin only)
router.put('/reviews/:id', authenticate, isAdmin, (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    
    let data = reviewsPageDb.findAll();
    if (Array.isArray(data) && data.length === 0) {
      data = getDefaultData();
    }
    
    const reviewIndex = data.reviews?.findIndex(r => r.id === id);
    if (reviewIndex === -1 || reviewIndex === undefined) {
      return res.status(404).json({ success: false, error: 'Review not found' });
    }
    
    // Update allowed fields
    const allowedFields = ['name', 'avatar', 'date', 'rating', 'product', 'productIcon', 'content', 'helpful', 'verified', 'status', 'brandReply'];
    allowedFields.forEach(field => {
      if (updates[field] !== undefined) {
        data.reviews[reviewIndex][field] = updates[field];
      }
    });
    data.reviews[reviewIndex].updatedAt = new Date().toISOString();
    data.updatedAt = new Date().toISOString();
    
    reviewsPageDb._write(data);
    
    res.json({ success: true, message: 'Review updated', review: data.reviews[reviewIndex] });
  } catch (error) {
    console.error('Error updating review:', error);
    res.status(500).json({ success: false, error: 'Failed to update review' });
  }
});

// PUT /api/reviews-page/reviews/:id/reply - Add/Update brand reply (admin only)
router.put('/reviews/:id/reply', authenticate, isAdmin, (req, res) => {
  try {
    const { id } = req.params;
    const { reply } = req.body;
    
    let data = reviewsPageDb.findAll();
    if (Array.isArray(data) && data.length === 0) {
      data = getDefaultData();
    }
    
    const reviewIndex = data.reviews?.findIndex(r => r.id === id);
    if (reviewIndex === -1 || reviewIndex === undefined) {
      return res.status(404).json({ success: false, error: 'Review not found' });
    }
    
    data.reviews[reviewIndex].brandReply = reply || null;
    data.reviews[reviewIndex].replyDate = reply ? new Date().toISOString() : null;
    data.updatedAt = new Date().toISOString();
    
    reviewsPageDb._write(data);
    
    res.json({ success: true, message: reply ? 'Reply added' : 'Reply removed', review: data.reviews[reviewIndex] });
  } catch (error) {
    console.error('Error updating reply:', error);
    res.status(500).json({ success: false, error: 'Failed to update reply' });
  }
});

// PUT /api/reviews-page/reviews/:id/status - Change review status (admin only)
router.put('/reviews/:id/status', authenticate, isAdmin, (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    
    if (!['visible', 'hidden', 'deleted'].includes(status)) {
      return res.status(400).json({ success: false, error: 'Status must be visible, hidden, or deleted' });
    }
    
    let data = reviewsPageDb.findAll();
    if (Array.isArray(data) && data.length === 0) {
      data = getDefaultData();
    }
    
    const reviewIndex = data.reviews?.findIndex(r => r.id === id);
    if (reviewIndex === -1 || reviewIndex === undefined) {
      return res.status(404).json({ success: false, error: 'Review not found' });
    }
    
    data.reviews[reviewIndex].status = status;
    data.updatedAt = new Date().toISOString();
    
    reviewsPageDb._write(data);
    
    res.json({ success: true, message: `Review ${status}`, review: data.reviews[reviewIndex] });
  } catch (error) {
    console.error('Error updating status:', error);
    res.status(500).json({ success: false, error: 'Failed to update status' });
  }
});

// DELETE /api/reviews-page/reviews/:id - Permanently delete review (admin only)
router.delete('/reviews/:id', authenticate, isAdmin, (req, res) => {
  try {
    const { id } = req.params;
    
    let data = reviewsPageDb.findAll();
    if (Array.isArray(data) && data.length === 0) {
      data = getDefaultData();
    }
    
    const reviewIndex = data.reviews?.findIndex(r => r.id === id);
    if (reviewIndex === -1 || reviewIndex === undefined) {
      return res.status(404).json({ success: false, error: 'Review not found' });
    }
    
    const deletedReview = data.reviews.splice(reviewIndex, 1)[0];
    data.updatedAt = new Date().toISOString();
    
    reviewsPageDb._write(data);
    
    res.json({ success: true, message: 'Review deleted permanently', review: deletedReview });
  } catch (error) {
    console.error('Error deleting review:', error);
    res.status(500).json({ success: false, error: 'Failed to delete review' });
  }
});

// ============ CUSTOMER PHOTOS ============

// PUT /api/reviews-page/customer-photos - Update customer photos (admin only)
router.put('/customer-photos', authenticate, isAdmin, (req, res) => {
  try {
    const { customerPhotos } = req.body;
    
    if (!Array.isArray(customerPhotos)) {
      return res.status(400).json({ success: false, error: 'customerPhotos must be an array' });
    }
    
    let data = reviewsPageDb.findAll();
    if (Array.isArray(data) && data.length === 0) {
      data = getDefaultData();
    }
    
    data.customerPhotos = customerPhotos.map((photo, index) => ({
      id: photo.id || `photo-${index + 1}`,
      username: photo.username || '@user',
      icon: photo.icon || 'ri-t-shirt-line',
      imageUrl: photo.imageUrl || null,
      active: photo.active !== false
    }));
    data.updatedAt = new Date().toISOString();
    
    reviewsPageDb._write(data);
    
    res.json({ success: true, message: 'Customer photos updated', customerPhotos: data.customerPhotos });
  } catch (error) {
    console.error('Error updating customer photos:', error);
    res.status(500).json({ success: false, error: 'Failed to update customer photos' });
  }
});

// ============ PARTNERSHIPS ============

// PUT /api/reviews-page/partnerships - Update partnerships (admin only)
router.put('/partnerships', authenticate, isAdmin, (req, res) => {
  try {
    const { partnerships } = req.body;
    
    if (!Array.isArray(partnerships)) {
      return res.status(400).json({ success: false, error: 'partnerships must be an array' });
    }
    
    let data = reviewsPageDb.findAll();
    if (Array.isArray(data) && data.length === 0) {
      data = getDefaultData();
    }
    
    data.partnerships = partnerships.map((partner, index) => ({
      id: partner.id || `partner-${index + 1}`,
      name: partner.name || 'Partner',
      description: partner.description || '',
      icon: partner.icon || 'ri-building-line',
      logoUrl: partner.logoUrl || null,
      active: partner.active !== false
    }));
    data.updatedAt = new Date().toISOString();
    
    reviewsPageDb._write(data);
    
    res.json({ success: true, message: 'Partnerships updated', partnerships: data.partnerships });
  } catch (error) {
    console.error('Error updating partnerships:', error);
    res.status(500).json({ success: false, error: 'Failed to update partnerships' });
  }
});

// ============ MILESTONES ============

// PUT /api/reviews-page/milestones - Update milestones (admin only)
router.put('/milestones', authenticate, isAdmin, (req, res) => {
  try {
    const { milestones } = req.body;
    
    if (!Array.isArray(milestones)) {
      return res.status(400).json({ success: false, error: 'milestones must be an array' });
    }
    
    let data = reviewsPageDb.findAll();
    if (Array.isArray(data) && data.length === 0) {
      data = getDefaultData();
    }
    
    data.milestones = milestones.map((milestone, index) => ({
      id: milestone.id || `milestone-${index + 1}`,
      year: milestone.year || new Date().getFullYear().toString(),
      title: milestone.title || 'Milestone',
      description: milestone.description || '',
      icon: milestone.icon || 'ri-award-line',
      color: milestone.color || '#10b981'
    }));
    data.updatedAt = new Date().toISOString();
    
    reviewsPageDb._write(data);
    
    res.json({ success: true, message: 'Milestones updated', milestones: data.milestones });
  } catch (error) {
    console.error('Error updating milestones:', error);
    res.status(500).json({ success: false, error: 'Failed to update milestones' });
  }
});

// ============ BULK UPDATE ============

// PUT /api/reviews-page/bulk - Bulk update all data (admin only)
router.put('/bulk', authenticate, isAdmin, (req, res) => {
  try {
    const updates = req.body;
    
    let data = reviewsPageDb.findAll();
    if (Array.isArray(data) && data.length === 0) {
      data = getDefaultData();
    }
    
    // Update only provided fields
    if (updates.stats) data.stats = { ...data.stats, ...updates.stats };
    if (updates.ratingBreakdown) data.ratingBreakdown = { ...data.ratingBreakdown, ...updates.ratingBreakdown };
    if (updates.megaStats) data.megaStats = updates.megaStats;
    if (updates.platforms) data.platforms = updates.platforms;
    if (updates.customerPhotos) data.customerPhotos = updates.customerPhotos;
    if (updates.partnerships) data.partnerships = updates.partnerships;
    if (updates.milestones) data.milestones = updates.milestones;
    
    data.updatedAt = new Date().toISOString();
    
    reviewsPageDb._write(data);
    
    res.json({ success: true, message: 'Bulk update complete', data });
  } catch (error) {
    console.error('Error in bulk update:', error);
    res.status(500).json({ success: false, error: 'Failed to perform bulk update' });
  }
});

module.exports = router;
