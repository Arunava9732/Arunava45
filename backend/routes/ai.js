const express = require('express');
const router = express.Router();
const path = require('path');
const { 
  runAIHub,
  getAIHealth, 
  getAICapabilities,
  analytics,
  fraud,
  email,
  search,
  recommend,
  price,
  image,
  payment,
  health,
  analysis
} = require('../utils/python_bridge');
const { loadJSON, saveJSON } = require('../utils/fileHelpers');

// ==========================================
// AI HUB STATUS & HEALTH
// ==========================================

// Get AI system health (basic)
router.get('/health', async (req, res) => {
  try {
    const aiHealth = await getAIHealth();
    res.json(aiHealth);
  } catch (error) {
    res.status(500).json({ error: error.message, status: 'error' });
  }
});

// Get full system health (server + AI)
router.get('/health/full', async (req, res) => {
  try {
    const fullHealth = await health.fullCheck();
    res.json(fullHealth);
  } catch (error) {
    res.status(500).json({ error: error.message, status: 'error' });
  }
});

// Get system-only health
router.get('/health/system', async (req, res) => {
  try {
    const systemHealth = await health.systemHealth();
    res.json(systemHealth);
  } catch (error) {
    res.status(500).json({ error: error.message, status: 'error' });
  }
});

// Get AI engines health
router.get('/health/engines', async (req, res) => {
  try {
    const enginesHealth = await health.aiEnginesHealth();
    res.json(enginesHealth);
  } catch (error) {
    res.status(500).json({ error: error.message, status: 'error' });
  }
});

// Diagnose specific engine
router.get('/health/diagnose/:engine', async (req, res) => {
  try {
    const { engine: engineName } = req.params;
    const diagnosis = await health.diagnoseEngine(engineName);
    res.json(diagnosis);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Auto-debug an error
router.post('/debug/error', async (req, res) => {
  try {
    const errorInfo = req.body;
    const debugResult = await health.analyzeError(errorInfo);
    res.json(debugResult);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Analyze logs for issues
router.post('/debug/logs', async (req, res) => {
  try {
    const { logs } = req.body;
    const logAnalysis = await health.analyzeLogs(logs || []);
    res.json(logAnalysis);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all AI capabilities
router.get('/capabilities', async (req, res) => {
  try {
    const capabilities = await getAICapabilities();
    res.json(capabilities);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// PAYMENT VERIFICATION AI
// ==========================================

// Verify payment with AI
router.post('/payment/verify', async (req, res) => {
  try {
    const { paymentData, orderData, userHistory } = req.body;
    const result = await payment.verify(paymentData, orderData, userHistory);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Batch verify payments
router.post('/payment/batch-verify', async (req, res) => {
  try {
    const { payments: paymentsList, ordersMap, usersMap } = req.body;
    const result = await payment.batchVerify(paymentsList, ordersMap, usersMap);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Analyze refund risk
router.post('/payment/refund-risk', async (req, res) => {
  try {
    const { order, userHistory } = req.body;
    const result = await payment.refundRisk(order, userHistory);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// ANALYTICS ENGINE
// ==========================================

// RFM Analysis (Customer Segmentation)
router.post('/analytics/rfm', async (req, res) => {
  try {
    const users = await loadJSON('users.json');
    const orders = await loadJSON('orders.json');
    
    const result = await analytics.rfmAnalysis(
      users || [],
      orders || []
    );
    
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Cohort Analysis
router.post('/analytics/cohort', async (req, res) => {
  try {
    const { period = 'monthly' } = req.body;
    const orders = await loadJSON('orders.json');
    
    const result = await analytics.cohortAnalysis(orders || [], period);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Sales Forecast
router.post('/analytics/forecast', async (req, res) => {
  try {
    const { salesHistory, periods = 7 } = req.body;
    const orders = await loadJSON('orders.json');
    
    // Generate sales history from orders if not provided
    let history = salesHistory;
    if (!history && orders) {
      const dailySales = {};
      orders.forEach(order => {
        const date = new Date(order.createdAt || order.timestamp).toISOString().split('T')[0];
        dailySales[date] = (dailySales[date] || 0) + (order.total || 0);
      });
      history = Object.values(dailySales);
    }
    
    const result = await analytics.salesForecast(history || [], periods);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Product Performance
router.get('/analytics/products', async (req, res) => {
  try {
    const orders = await loadJSON('orders.json');
    const result = await analytics.productPerformance(orders || []);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// A/B Test Analysis
router.post('/analytics/ab-test', async (req, res) => {
  try {
    const { control, variant } = req.body;
    const result = await analytics.abTest(control, variant);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// FRAUD DETECTION ENGINE
// ==========================================

// Analyze single transaction
router.post('/fraud/analyze', async (req, res) => {
  try {
    const { transaction } = req.body;
    const orders = await loadJSON('orders.json');
    
    const result = await fraud.analyzeTransaction(
      transaction,
      orders || []
    );
    
    // Save high-risk transactions
    if (result.riskLevel === 'HIGH' || result.riskLevel === 'CRITICAL') {
      const securityEvents = await loadJSON('securityEvents.json') || { events: [] };
      securityEvents.events.push({
        type: 'FRAUD_ALERT',
        ...result,
        timestamp: new Date().toISOString()
      });
      await saveJSON('securityEvents.json', securityEvents);
    }
    
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Batch analyze transactions
router.post('/fraud/batch', async (req, res) => {
  try {
    const { transactions } = req.body;
    const orders = await loadJSON('orders.json');
    
    const result = await fraud.batchAnalyze(
      transactions,
      orders || []
    );
    
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get fraud statistics
router.get('/fraud/stats', async (req, res) => {
  try {
    const orders = await loadJSON('orders.json');
    const result = await fraud.getStats(orders || []);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// EMAIL TEMPLATE ENGINE
// ==========================================

// Generate email template
router.post('/email/generate', async (req, res) => {
  try {
    const { type, ...data } = req.body;
    const result = await email.generate(type, data);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Preview email
router.post('/email/preview', async (req, res) => {
  try {
    const { type, ...data } = req.body;
    const result = await email.generate(type, data);
    
    // Return HTML for preview
    res.setHeader('Content-Type', 'text/html');
    res.send(result.html || '<p>Error generating preview</p>');
  } catch (error) {
    res.status(500).send(`<p>Error: ${error.message}</p>`);
  }
});

// ==========================================
// SEARCH ENGINE
// ==========================================

// Full-text search
router.post('/search', async (req, res) => {
  try {
    const { query, options = {} } = req.body;
    const products = await loadJSON('products.json');
    
    const result = await search.search(
      query,
      products || [],
      options
    );
    
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Autocomplete suggestions
router.get('/search/autocomplete', async (req, res) => {
  try {
    const { q: prefix, limit = 10 } = req.query;
    const products = await loadJSON('products.json');
    
    const result = await search.autocomplete(
      prefix || '',
      products || [],
      parseInt(limit)
    );
    
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Build search index
router.post('/search/index', async (req, res) => {
  try {
    const products = await loadJSON('products.json');
    const result = await search.buildIndex(products || []);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Trending searches
router.get('/search/trending', async (req, res) => {
  try {
    const { limit = 10 } = req.query;
    // Load search history if available
    const analyticsData = await loadJSON('analytics.json');
    const searchHistory = analyticsData?.searchHistory || [];
    
    const result = await search.trendingSearches(searchHistory, parseInt(limit));
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// RECOMMENDATION ENGINE
// ==========================================

// Similar products
router.get('/recommend/similar/:productId', async (req, res) => {
  try {
    const { productId } = req.params;
    const { limit = 10 } = req.query;
    const products = await loadJSON('products.json');
    
    const targetProduct = products?.find(p => p.id === productId || p.id === parseInt(productId));
    
    if (!targetProduct) {
      return res.status(404).json({ error: 'Product not found' });
    }
    
    const result = await recommend.similar(
      targetProduct,
      products,
      parseInt(limit)
    );
    
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Trending products
router.get('/recommend/trending', async (req, res) => {
  try {
    const { days = 7, limit = 10 } = req.query;
    const orders = await loadJSON('orders.json');
    const products = await loadJSON('products.json');
    
    const result = await recommend.trending(
      orders || [],
      products || [],
      parseInt(days),
      parseInt(limit)
    );
    
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Frequently bought together
router.get('/recommend/together/:productId', async (req, res) => {
  try {
    const { productId } = req.params;
    const { limit = 5 } = req.query;
    const orders = await loadJSON('orders.json');
    const products = await loadJSON('products.json');
    
    const result = await recommend.frequentlyBoughtTogether(
      productId,
      orders || [],
      products || [],
      parseInt(limit)
    );
    
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Personalized recommendations (requires auth)
router.get('/recommend/personalized', async (req, res) => {
  try {
    const { limit = 10 } = req.query;
    const userId = req.user?.id || req.query.userId;
    
    const users = await loadJSON('users.json');
    const orders = await loadJSON('orders.json');
    const products = await loadJSON('products.json');
    
    // Get user data
    const user = users?.find(u => u.id === userId);
    const userData = {
      browsingHistory: user?.browsingHistory || [],
      purchaseHistory: orders?.filter(o => o.userId === userId) || [],
      wishlist: user?.wishlist || []
    };
    
    const result = await recommend.personalized(
      userData,
      products || [],
      orders || [],
      parseInt(limit)
    );
    
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// PRICE OPTIMIZATION ENGINE
// ==========================================

// Optimize price for a product
router.post('/price/optimize', async (req, res) => {
  try {
    const { productId, cost, demand, competitorPrices } = req.body;
    const products = await loadJSON('products.json');
    
    const product = products?.find(p => p.id === productId || p.id === parseInt(productId));
    
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }
    
    const result = await price.optimize(
      product,
      cost || product.price * 0.4,
      demand || 10,
      competitorPrices || []
    );
    
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Bundle pricing
router.post('/price/bundle', async (req, res) => {
  try {
    const { productIds, discount = 15 } = req.body;
    const products = await loadJSON('products.json');
    
    const bundleProducts = products?.filter(p => 
      productIds?.includes(p.id) || productIds?.includes(String(p.id))
    );
    
    const result = await price.bundle(bundleProducts || [], discount);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Clearance pricing
router.post('/price/clearance', async (req, res) => {
  try {
    const { targetDays = 30 } = req.body;
    const products = await loadJSON('products.json');
    
    // Filter slow-moving products
    const slowMoving = products?.filter(p => (p.stock || 0) > 50) || [];
    
    const result = await price.clearance(slowMoving, targetDays);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Margin analysis
router.get('/price/margin', async (req, res) => {
  try {
    const products = await loadJSON('products.json');
    const costs = await loadJSON('productCosts.json');
    
    const result = await price.marginAnalysis(products || [], costs || []);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// IMAGE PROCESSOR ENGINE
// ==========================================

// Check image processor dependencies
router.get('/image/check', async (req, res) => {
  try {
    const result = await image.checkDependencies();
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Analyze image
router.post('/image/analyze', async (req, res) => {
  try {
    const { imagePath } = req.body;
    
    if (!imagePath) {
      return res.status(400).json({ error: 'imagePath is required' });
    }
    
    const fullPath = path.join(__dirname, '..', 'uploads', imagePath);
    const result = await image.analyze(fullPath);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Optimize image
router.post('/image/optimize', async (req, res) => {
  try {
    const { imagePath, options = {} } = req.body;
    
    if (!imagePath) {
      return res.status(400).json({ error: 'imagePath is required' });
    }
    
    const inputPath = path.join(__dirname, '..', 'uploads', imagePath);
    const outputPath = path.join(__dirname, '..', 'uploads', 'optimized', imagePath);
    
    const result = await image.optimize(inputPath, outputPath, options);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create thumbnail
router.post('/image/thumbnail', async (req, res) => {
  try {
    const { imagePath, size = [200, 200] } = req.body;
    
    if (!imagePath) {
      return res.status(400).json({ error: 'imagePath is required' });
    }
    
    const inputPath = path.join(__dirname, '..', 'uploads', imagePath);
    const outputPath = path.join(__dirname, '..', 'uploads', 'thumbnails', imagePath);
    
    const result = await image.thumbnail(inputPath, outputPath, size);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// ANALYSIS ENGINE (Unified Analytics)
// ==========================================

// Generate business insights
router.post('/analysis/insights', async (req, res) => {
  try {
    const users = await loadJSON('users.json') || [];
    const orders = await loadJSON('orders.json') || [];
    const products = await loadJSON('products.json') || [];
    
    const result = await analysis.insights({
      users: users.users || users,
      orders: orders.orders || orders,
      products: products.products || products
    });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Analyze sentiment from reviews/feedback
router.post('/analysis/sentiment', async (req, res) => {
  try {
    const { texts } = req.body;
    const result = await analysis.sentiment(texts || []);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Predict stock levels
router.post('/analysis/predict-stock', async (req, res) => {
  try {
    const products = await loadJSON('products.json') || [];
    const orders = await loadJSON('orders.json') || [];
    
    const result = await analysis.predictStock({
      products: products.products || products,
      orders: orders.orders || orders
    });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// SEO Audit
router.post('/analysis/seo-audit', async (req, res) => {
  try {
    const products = await loadJSON('products.json') || [];
    const seoData = await loadJSON('seoData.json') || {};
    
    const result = await analysis.seoAudit({
      products: products.products || products,
      seoData: seoData
    });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Security scan
router.post('/analysis/security-scan', async (req, res) => {
  try {
    const users = await loadJSON('users.json') || [];
    const sessions = await loadJSON('sessions.json') || {};
    const securityEvents = await loadJSON('securityEvents.json') || { events: [] };
    
    const result = await analysis.securityScan({
      users: users.users || users,
      sessions: sessions,
      events: securityEvents.events || []
    });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Train models
router.post('/analysis/train', async (req, res) => {
  try {
    const { modelType } = req.body;
    const orders = await loadJSON('orders.json') || [];
    const products = await loadJSON('products.json') || [];
    
    const result = await analysis.train({
      modelType: modelType || 'recommendation',
      orders: orders.orders || orders,
      products: products.products || products
    });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Predict user intent
router.post('/analysis/predict-intent', async (req, res) => {
  try {
    const { userId, sessionData } = req.body;
    const users = await loadJSON('users.json') || [];
    const orders = await loadJSON('orders.json') || [];
    
    const user = (users.users || users).find(u => u.id === userId);
    const userOrders = (orders.orders || orders).filter(o => o.userId === userId);
    
    const result = await analysis.predictIntent({
      user: user || {},
      sessionData: sessionData || {},
      orderHistory: userOrders
    });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Generate SEO keywords
router.post('/analysis/seo-keywords', async (req, res) => {
  try {
    const products = await loadJSON('products.json') || [];
    
    const result = await analysis.seoKeywords({
      products: products.products || products
    });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// UNIFIED AI DASHBOARD DATA
// ==========================================

// Get complete AI dashboard data
router.get('/dashboard', async (req, res) => {
  try {
    // Collect health from all systems
    const [aiHealth, systemHealth, capabilities] = await Promise.all([
      getAIHealth().catch(e => ({ status: 'error', error: e.message })),
      health.systemHealth().catch(e => ({ status: 'error', error: e.message })),
      getAICapabilities().catch(e => ({ engines: [] }))
    ]);
    
    // Load recent security events
    const securityEvents = await loadJSON('securityEvents.json') || { events: [] };
    const recentAlerts = (securityEvents.events || [])
      .filter(e => e.type === 'FRAUD_ALERT')
      .slice(-10);
    
    res.json({
      status: aiHealth.status === 'healthy' && systemHealth.status !== 'critical' ? 'healthy' : 'degraded',
      ai: aiHealth,
      system: systemHealth,
      capabilities: capabilities,
      recentAlerts: recentAlerts,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Run complete system diagnostics
router.get('/diagnostics', async (req, res) => {
  try {
    const fullHealth = await health.fullCheck();
    const capabilities = await getAICapabilities();
    
    // Check each engine
    const engineChecks = {};
    const engines = [
      'analytics', 'fraud', 'email', 'search', 'recommend', 
      'price', 'image', 'payment', 'analysis', 'neural',
      'emotion', 'performance', 'errors', 'ml', 'security',
      'realtime', 'seo', 'sales'
    ];
    
    for (const engineName of engines) {
      try {
        const diagnosis = await health.diagnoseEngine(engineName);
        engineChecks[engineName] = diagnosis;
      } catch (e) {
        engineChecks[engineName] = { status: 'error', error: e.message };
      }
    }
    
    res.json({
      fullHealth,
      capabilities,
      engineDiagnostics: engineChecks,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
