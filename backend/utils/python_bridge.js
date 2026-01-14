const { spawn } = require('child_process');
const path = require('path');
const logger = require('./logger');

/**
 * Executes a Python script and returns the result
 * @param {string} scriptName - Name of the script in the ml/ directory
 * @param {Array} args - Arguments to pass to the script
 * @param {number} timeout - Execution timeout in ms (default 30s)
 */
const runPythonScript = (scriptName, args = [], timeout = 30000) => {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(__dirname, '..', 'ml', scriptName);
    
    // Check if python or python3 is available
    const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
    
    let processArgs = [scriptPath];
    let stdinData = null;

    if (args.length > 0) {
      processArgs.push(args[0]); // task
      if (args.length > 1) {
        // If data is long (> 4000 chars), use stdin to avoid OS command line limits
        if (args[1].length > 4000) {
          processArgs.push('--stdin');
          stdinData = args[1];
        } else {
          processArgs.push(args[1]);
        }
      }
      // Push remaining args if any
      if (args.length > 2) {
        processArgs.push(...args.slice(2));
      }
    }

    logger.info(`🚀 [Python Bridge] Running ${scriptName} task: ${args[0] || 'default'}`);
    
    const pyProcess = spawn(pythonCmd, processArgs);

    // Timeout mechanism
    const timer = setTimeout(() => {
      pyProcess.kill();
      reject(new Error(`Timeout: ${scriptName} ${args[0]} took too long (> ${timeout}ms)`));
    }, timeout);
    
    if (stdinData) {
      pyProcess.stdin.write(stdinData);
      pyProcess.stdin.end();
    }
    
    let stdout = '';
    let stderr = '';
    
    pyProcess.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    pyProcess.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    pyProcess.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        logger.error(`❌ [Python Bridge] Script ${scriptName} exited with code ${code}`);
        logger.error(`Stderr: ${stderr}`);
        return reject(new Error(stderr || `Exited with code ${code}`));
      }
      
      try {
        const result = JSON.parse(stdout);
        resolve(result);
      } catch (e) {
        resolve(stdout); // Return raw output if not JSON
      }
    });

    pyProcess.on('error', (err) => {
      clearTimeout(timer);
      logger.error(`❌ [Python Bridge] Failed to start python process: ${err.message}`);
      reject(err);
    });
  });
};

// ==========================================
// AI HUB INTEGRATION
// ==========================================

/**
 * Run a task through the AI Hub (unified interface to all ML engines)
 * @param {string} engine - Engine name (analytics, fraud, email, search, recommend, price, image)
 * @param {string} task - Task to execute
 * @param {object} data - Data to pass to the task
 */
const runAIHub = async (engine, task, data = {}) => {
  const command = `${engine}/${task}`;
  return runPythonScript('ai_hub.py', [command, JSON.stringify(data)]);
};

/**
 * Get AI Hub health status
 */
const getAIHealth = async () => {
  return runPythonScript('ai_hub.py', ['health']);
};

/**
 * Get all AI capabilities
 */
const getAICapabilities = async () => {
  return runPythonScript('ai_hub.py', ['capabilities']);
};

// ==========================================
// SPECIALIZED ENGINE SHORTCUTS
// ==========================================

/**
 * Analytics Engine shortcuts
 */
const analytics = {
  rfmAnalysis: (customers, orders) => runAIHub('analytics', 'rfm', { customers, orders }),
  cohortAnalysis: (orders, period = 'monthly') => runAIHub('analytics', 'cohort', { orders, period }),
  salesForecast: (salesHistory, periods = 7) => runAIHub('analytics', 'forecast', { salesHistory, periods }),
  productPerformance: (orders) => runAIHub('analytics', 'product-performance', { orders }),
  abTest: (control, variant) => runAIHub('analytics', 'ab-test', { control, variant })
};

/**
 * Fraud Detection Engine shortcuts
 */
const fraud = {
  analyzeTransaction: (transaction, history = []) => runAIHub('fraud', 'analyze', { transaction, history }),
  batchAnalyze: (transactions, history = []) => runAIHub('fraud', 'batch', { transactions, history }),
  getStats: (history) => runAIHub('fraud', 'stats', { history })
};

/**
 * Email Template Engine shortcuts
 */
const email = {
  generate: (type, data) => runAIHub('email', type, { type, ...data }),
  orderConfirmation: (order, customer) => runAIHub('email', 'order-confirmation', { type: 'order_confirmation', order, customer }),
  welcome: (customer, promoCode) => runAIHub('email', 'welcome', { type: 'welcome', customer, promoCode }),
  shipping: (order, customer, tracking) => runAIHub('email', 'shipping', { type: 'shipping', order, customer, tracking }),
  passwordReset: (resetLink, expires) => runAIHub('email', 'password-reset', { type: 'password_reset', resetLink, expires }),
  abandonedCart: (customer, items, total, discount) => runAIHub('email', 'abandoned-cart', { type: 'abandoned_cart', customer, items, total, discount })
};

/**
 * Search Engine shortcuts
 */
const search = {
  search: (query, products, options = {}) => runAIHub('search', 'search', { query, products, options }),
  autocomplete: (prefix, products, limit = 10) => runAIHub('search', 'autocomplete', { prefix, products, limit }),
  buildIndex: (products) => runAIHub('search', 'index', { products }),
  trendingSearches: (history, limit = 10) => runAIHub('search', 'trending', { history, limit })
};

/**
 * Recommendation Engine shortcuts
 */
const recommend = {
  similar: (product, products, limit = 10) => runAIHub('recommend', 'similar', { product, products, limit }),
  collaborative: (userId, userHistory, allHistory, products, limit = 10) => 
    runAIHub('recommend', 'collaborative', { userId, userHistory, allHistory, products, limit }),
  trending: (orders, products, days = 7, limit = 10) => runAIHub('recommend', 'trending', { orders, products, days, limit }),
  frequentlyBoughtTogether: (productId, orders, products, limit = 5) => 
    runAIHub('recommend', 'together', { productId, orders, products, limit }),
  personalized: (userData, products, orders, limit = 10) => 
    runAIHub('recommend', 'personalized', { userData, products, orders, limit })
};

/**
 * Price Optimizer shortcuts
 */
const price = {
  optimize: (product, cost, demand, competitorPrices = []) => 
    runAIHub('price', 'optimize', { product, cost, demand, competitorPrices }),
  bundle: (products, discount = 15) => runAIHub('price', 'bundle', { products, discount }),
  clearance: (products, targetDays = 30) => runAIHub('price', 'clearance', { products, targetDays }),
  seasonal: (product, season) => runAIHub('price', 'seasonal', { product, season }),
  marginAnalysis: (products, costs = []) => runAIHub('price', 'margin', { products, costs })
};

/**
 * Image Processor shortcuts
 */
const image = {
  checkDependencies: () => runAIHub('image', 'check', {}),
  optimize: (inputPath, outputPath, options = {}) => runAIHub('image', 'optimize', { inputPath, outputPath, options }),
  thumbnail: (inputPath, outputPath, size = [200, 200]) => runAIHub('image', 'thumbnail', { inputPath, outputPath, size }),
  analyze: (imagePath) => runAIHub('image', 'analyze', { imagePath })
};

/**
 * Payment Verification AI shortcuts
 */
const payment = {
  verify: (paymentData, orderData, userHistory) => 
    runAIHub('payment', 'verify', { payment: paymentData, order: orderData, userHistory }),
  batchVerify: (payments, ordersMap, usersMap) => 
    runAIHub('payment', 'batch', { payments, ordersMap, usersMap }),
  refundRisk: (order, userHistory) => 
    runAIHub('payment', 'refund-risk', { order, userHistory })
};

/**
 * Health Monitor & Auto-Debugger shortcuts
 */
const health = {
  fullCheck: () => runAIHub('health', 'full', {}),
  systemHealth: () => runAIHub('health', 'system', {}),
  aiEnginesHealth: () => runAIHub('health', 'ai', {}),
  diagnoseEngine: (engineName) => runAIHub('health', 'diagnose', { engine: engineName }),
  analyzeError: (errorInfo) => runAIHub('health', 'debug', { error: errorInfo }),
  analyzeLogs: (logs) => runAIHub('health', 'logs', { logs })
};

/**
 * Core Analysis Engine shortcuts
 */
const analysis = {
  insights: (data) => runAIHub('analysis', 'insights', data),
  sentiment: (text) => runAIHub('analysis', 'sentiment', { text }),
  predictStock: (data) => runAIHub('analysis', 'predict-stock', data),
  seoAudit: (data) => runAIHub('analysis', 'seo-audit', data),
  securityScan: (data) => runAIHub('analysis', 'security-scan', data),
  train: (data) => runAIHub('analysis', 'train', data),
  predictIntent: (data) => runAIHub('analysis', 'predict-intent', data),
  seoKeywords: (products) => runAIHub('analysis', 'seo-keywords', { products })
};

/**
 * Neural Commerce Engine shortcuts
 */
const neural = {
  predictPurchaseIntent: (data) => runAIHub('neural', 'intent', data),
  optimizePlacement: (data) => runAIHub('neural', 'placement', data),
  dynamicPricing: (data) => runAIHub('neural', 'pricing', data),
  customerJourney: (data) => runAIHub('neural', 'journey', data),
  predictChurn: (data) => runAIHub('neural', 'churn', data)
};

/**
 * Emotion AI Engine shortcuts
 */
const emotion = {
  analyzeSentiment: (data) => runAIHub('emotion', 'sentiment', data),
  analyzeFeedback: (data) => runAIHub('emotion', 'feedback', data),
  detectIntent: (data) => runAIHub('emotion', 'intent', data),
  generateEmpatheticResponse: (data) => runAIHub('emotion', 'empathy', data),
  analyzeReviews: (data) => runAIHub('emotion', 'reviews', data)
};

/**
 * Performance Optimizer Engine shortcuts
 */
const performance = {
  analyze: (data) => runAIHub('performance', 'analyze', data),
  optimizeQueries: (data) => runAIHub('performance', 'queries', data),
  cacheRecommendations: (data) => runAIHub('performance', 'cache', data),
  loadTestAnalysis: (data) => runAIHub('performance', 'loadtest', data),
  getRealtimeMetrics: () => runAIHub('performance', 'metrics', {})
};

/**
 * Error Tracker Engine shortcuts
 */
const errors = {
  track: (errorData) => runAIHub('errors', 'track', errorData),
  analyzeTrends: (data) => runAIHub('errors', 'trends', data),
  generateReport: (data) => runAIHub('errors', 'report', data),
  autoResolve: (errorData) => runAIHub('errors', 'resolve', errorData)
};

/**
 * ML Engine shortcuts
 */
const ml = {
  predict: (data) => runAIHub('ml', 'predict', data),
  train: (data) => runAIHub('ml', 'train', data),
  getModelInfo: (modelType = 'sales') => runAIHub('ml', 'info', { modelType }),
  salesPrediction: (data) => runAIHub('ml', 'sales', data),
  customerSegmentation: (data) => runAIHub('ml', 'segment', data),
  demandForecast: (data) => runAIHub('ml', 'demand', data),
  anomalyDetection: (data) => runAIHub('ml', 'anomaly', data),
  trendAnalysis: (data) => runAIHub('ml', 'trend', data)
};

/**
 * Security Manager Engine shortcuts
 */
const security = {
  analyzeRequest: (data) => runAIHub('security', 'analyze', data),
  analyzeTraffic: (data) => runAIHub('security', 'traffic', data),
  vulnerabilityScan: (data) => runAIHub('security', 'scan', data),
  detectBruteForce: (data) => runAIHub('security', 'brute-force', data),
  generateReport: (data) => runAIHub('security', 'report', data)
};

/**
 * Real-Time Manager Engine shortcuts
 */
const realtime = {
  processMetric: (data) => runAIHub('realtime', 'metric', data),
  getLiveStats: (data) => runAIHub('realtime', 'stats', data),
  trackActiveUsers: (data) => runAIHub('realtime', 'users', data),
  trackConversions: (data) => runAIHub('realtime', 'conversions', data),
  monitorInventory: (data) => runAIHub('realtime', 'inventory', data),
  getDashboard: (data) => runAIHub('realtime', 'dashboard', data)
};

/**
 * SEO Engine shortcuts
 */
const seo = {
  analyzePage: (data) => runAIHub('seo', 'analyze', data),
  generateKeywords: (data) => runAIHub('seo', 'keywords', data),
  generateMetaTags: (data) => runAIHub('seo', 'meta', data),
  auditSite: (data) => runAIHub('seo', 'audit', data),
  optimizeContent: (data) => runAIHub('seo', 'optimize', data)
};

/**
 * Sales Insights Engine shortcuts
 */
const sales = {
  generateInsights: (data) => runAIHub('sales', 'insights', data),
  forecastSales: (data) => runAIHub('sales', 'forecast', data),
  comparePeriods: (data) => runAIHub('sales', 'compare', data)
};

module.exports = { 
  runPythonScript,
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
  analysis,
  // New engines
  neural,
  emotion,
  performance,
  errors,
  ml,
  security,
  realtime,
  seo,
  sales
};
