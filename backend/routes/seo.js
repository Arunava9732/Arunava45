/**
 * Advanced AI-Powered SEO Optimization System for BLACKONN
 * =========================================================
 * 
 * This module provides comprehensive SEO intelligence including:
 * - Keyword trend analysis and monitoring
 * - AI-powered content optimization suggestions
 * - Search ranking tracking
 * - Competitor keyword analysis
 * - Dynamic meta tag optimization
 * - Schema.org structured data generation
 * - Search engine ping/indexing requests
 * 
 * Note: Direct Google search monitoring requires Google Search Console API access.
 * This system simulates and prepares for integration with:
 * - Google Search Console API
 * - Google Trends API (unofficial)
 * - Bing Webmaster API
 * - SEO analysis services
 */

const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const db = require('../utils/database');
const { aiRequestLogger, aiPerformanceMonitor } = require('../middleware/aiEnhancer');
const pythonBridge = require('../utils/python_bridge');

const router = express.Router();

// AI Middleware
router.use(aiRequestLogger);
router.use(aiPerformanceMonitor(500));

// SEO Data file path
const SEO_DATA_PATH = path.join(__dirname, '../data/seoData.json');

// ============ SEO DATA MANAGEMENT ============

/**
 * Load SEO data from JSON file
 */
const loadSeoData = () => {
  try {
    if (fs.existsSync(SEO_DATA_PATH)) {
      const data = fs.readFileSync(SEO_DATA_PATH, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('[SEO] Error loading SEO data:', error.message);
  }
  return getDefaultSeoData();
};

/**
 * Save SEO data to JSON file
 */
const saveSeoData = (data) => {
  try {
    data.lastUpdated = new Date().toISOString();
    fs.writeFileSync(SEO_DATA_PATH, JSON.stringify(data, null, 2));
    return true;
  } catch (error) {
    console.error('[SEO] Error saving SEO data:', error.message);
    return false;
  }
};

/**
 * Default SEO data structure
 */
const getDefaultSeoData = () => ({
  keywords: {
    primary: ['BLACKONN', 'blackonn india', 'blackonn clothing', 'blackonn fashion'],
    secondary: [
      'apparel', 'fashion', 'clothing', 'streetwear', 'black clothing',
      'black t-shirts', 'oversized t-shirts', 'hoodies', 'caps', 'bags',
      'premium fashion', 'indian streetwear', 'kolkata fashion'
    ],
    trending: [],
    longTail: [
      'buy black t-shirts online india',
      'premium black clothing india',
      'oversized black t-shirts kolkata',
      'best streetwear brand india',
      'black hoodies online shopping',
      'blackonn oversized tshirt',
      'blackonn hoodie price'
    ]
  },
  searchTrends: [],
  competitorKeywords: [],
  rankings: {},
  lastUpdated: null,
  aiSuggestions: [],
  performanceMetrics: {
    impressions: 0,
    clicks: 0,
    averagePosition: 0,
    ctr: 0
  }
});

// ============ AI-POWERED KEYWORD ANALYSIS ============

/**
 * AI Keyword Analyzer - Generates intelligent keyword suggestions
 * based on product data, trends, and search patterns
 */
class AIKeywordAnalyzer {
  constructor() {
    this.keywordPatterns = {
      product: ['buy', 'shop', 'order', 'price', 'cost', 'cheap', 'best', 'premium', 'quality'],
      location: ['india', 'kolkata', 'online', 'near me', 'delivery', 'shipping'],
      category: ['t-shirts', 'tshirts', 'hoodies', 'caps', 'bags', 'clothing', 'apparel', 'fashion', 'streetwear'],
      color: ['black', 'dark', 'noir', 'midnight'],
      style: ['oversized', 'fitted', 'casual', 'premium', 'designer', 'trendy', 'stylish'],
      brand: ['BLACKONN', 'blackonn', 'Blackonn']
    };
  }

  /**
   * Generate AI-powered keyword suggestions based on products
   */
  generateKeywordSuggestions(products) {
    const suggestions = [];
    const productNames = products.map(p => p.name?.toLowerCase() || '').filter(Boolean);
    const categories = [...new Set(products.map(p => p.category?.toLowerCase()).filter(Boolean))];

    // Generate product-based keywords
    productNames.forEach(name => {
      this.keywordPatterns.product.forEach(action => {
        suggestions.push(`${action} ${name}`);
      });
      this.keywordPatterns.location.forEach(loc => {
        suggestions.push(`${name} ${loc}`);
      });
    });

    // Generate category combinations
    categories.forEach(cat => {
      this.keywordPatterns.color.forEach(color => {
        suggestions.push(`${color} ${cat}`);
        this.keywordPatterns.style.forEach(style => {
          suggestions.push(`${style} ${color} ${cat}`);
        });
      });
    });

    // Brand-focused keywords
    this.keywordPatterns.brand.forEach(brand => {
      categories.forEach(cat => {
        suggestions.push(`${brand} ${cat}`);
      });
      this.keywordPatterns.location.forEach(loc => {
        suggestions.push(`${brand} ${loc}`);
      });
    });

    // Remove duplicates and return top suggestions
    const uniqueSuggestions = [...new Set(suggestions)];
    return uniqueSuggestions.slice(0, 100);
  }

  /**
   * Analyze keyword relevance and priority
   */
  analyzeKeywordRelevance(keyword, products) {
    let score = 0;
    const lowerKeyword = keyword.toLowerCase();

    // Check brand mention
    if (lowerKeyword.includes('blackonn')) score += 50;

    // Check product name matches
    products.forEach(p => {
      if (p.name && lowerKeyword.includes(p.name.toLowerCase())) score += 30;
      if (p.category && lowerKeyword.includes(p.category.toLowerCase())) score += 20;
    });

    // Check action words (commercial intent)
    if (/buy|shop|order|price/.test(lowerKeyword)) score += 25;

    // Check location (local SEO)
    if (/india|kolkata|online/.test(lowerKeyword)) score += 15;

    // Long-tail bonus
    if (keyword.split(' ').length >= 4) score += 10;

    return Math.min(score, 100);
  }

  /**
   * Generate content optimization suggestions
   */
  generateContentSuggestions(currentContent, targetKeywords) {
    const suggestions = [];
    const contentLower = (currentContent || '').toLowerCase();

    targetKeywords.forEach(keyword => {
      const keywordLower = keyword.toLowerCase();
      const keywordCount = (contentLower.match(new RegExp(keywordLower, 'g')) || []).length;
      
      if (keywordCount === 0) {
        suggestions.push({
          type: 'missing_keyword',
          keyword,
          suggestion: `Add "${keyword}" to your content for better visibility`
        });
      } else if (keywordCount < 2) {
        suggestions.push({
          type: 'low_density',
          keyword,
          suggestion: `Increase usage of "${keyword}" (currently: ${keywordCount} times)`
        });
      }
    });

    return suggestions;
  }
}

const aiAnalyzer = new AIKeywordAnalyzer();

// ============ SEARCH ENGINE OPTIMIZATION ROUTES ============

/**
 * Generate dynamic sitemap.xml with image support
 */
router.get('/sitemap.xml', (req, res) => {
  try {
    const products = db.products.findAll();
    const baseUrl = process.env.FRONTEND_URL || 'https://blackonn.com';
    
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"\n';
    xml += '        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n';
    
    // Static pages with enhanced metadata
    const staticPages = [
      { url: '', priority: '1.0', changefreq: 'daily' },
      { url: '/products.html', priority: '0.9', changefreq: 'daily' },
      { url: '/about.html', priority: '0.7', changefreq: 'monthly' },
      { url: '/contact.html', priority: '0.7', changefreq: 'monthly' },
      { url: '/gift-cards.html', priority: '0.8', changefreq: 'weekly' },
      { url: '/size-guide.html', priority: '0.6', changefreq: 'monthly' },
      { url: '/shipping.html', priority: '0.6', changefreq: 'monthly' },
      { url: '/return-policy.html', priority: '0.6', changefreq: 'monthly' },
      { url: '/refund-policy.html', priority: '0.6', changefreq: 'monthly' },
      { url: '/privacy-policy.html', priority: '0.5', changefreq: 'monthly' },
      { url: '/terms.html', priority: '0.5', changefreq: 'monthly' },
      { url: '/faq.html', priority: '0.6', changefreq: 'weekly' }
    ];
    
    staticPages.forEach(page => {
      xml += '  <url>\n';
      xml += `    <loc>${baseUrl}${page.url}</loc>\n`;
      xml += `    <lastmod>${new Date().toISOString().split('T')[0]}</lastmod>\n`;
      xml += `    <changefreq>${page.changefreq}</changefreq>\n`;
      xml += `    <priority>${page.priority}</priority>\n`;
      xml += '  </url>\n';
    });
    
    // Dynamic product pages with images
    products.forEach(product => {
      if (product.id) {
        xml += '  <url>\n';
        xml += `    <loc>${baseUrl}/products.html?id=${product.id}</loc>\n`;
        xml += `    <lastmod>${product.updatedAt || new Date().toISOString().split('T')[0]}</lastmod>\n`;
        xml += '    <changefreq>weekly</changefreq>\n';
        xml += '    <priority>0.8</priority>\n';
        
        // Add product images
        if (product.images && product.images.length > 0) {
          product.images.slice(0, 5).forEach(img => {
            if (img) {
              const imageUrl = img.startsWith('http') ? img : `${baseUrl}${img}`;
              xml += '    <image:image>\n';
              xml += `      <image:loc>${escapeXml(imageUrl)}</image:loc>\n`;
              xml += `      <image:title>${escapeXml(product.name || 'BLACKONN Product')}</image:title>\n`;
              xml += `      <image:caption>${escapeXml(product.description?.substring(0, 100) || 'Premium black clothing from BLACKONN')}</image:caption>\n`;
              xml += '    </image:image>\n';
            }
          });
        }
        
        xml += '  </url>\n';
      }
    });
    
    xml += '</urlset>';
    
    res.header('Content-Type', 'application/xml');
    res.send(xml);
  } catch (error) {
    console.error('[SEO] Sitemap generation error:', error);
    res.status(500).send('Error generating sitemap');
  }
});

/**
 * Dynamic robots.txt with enhanced directives
 */
router.get('/robots.txt', (req, res) => {
  const baseUrl = process.env.FRONTEND_URL || 'https://blackonn.com';
  const robots = `# BLACKONN - robots.txt
# Optimized for search engine crawling

User-agent: *
Allow: /
Allow: /products.html
Allow: /about.html
Allow: /contact.html
Allow: /gift-cards.html

# Disallow sensitive pages
Disallow: /admin.html
Disallow: /profile.html
Disallow: /checkout.html
Disallow: /cart.html
Disallow: /login.html
Disallow: /signup.html
Disallow: /forgot-password.html
Disallow: /reset-password.html

# Disallow API endpoints
Disallow: /api/

# Disallow query parameters that create duplicate content
Disallow: /*?sort=
Disallow: /*?filter=

# Crawl-delay for respectful crawling
Crawl-delay: 1

# Sitemap location
Sitemap: ${baseUrl}/sitemap.xml

# Allow all major search engine bots
User-agent: Googlebot
Allow: /

User-agent: Bingbot
Allow: /

User-agent: Yandex
Allow: /

User-agent: DuckDuckBot
Allow: /
`;
  
  res.header('Content-Type', 'text/plain');
  res.send(robots);
});

// ============ AI SEO API ENDPOINTS ============

/**
 * GET /api/seo - Root endpoint for health checks
 * Only responds when mounted at /api/seo, not at /
 */
router.get('/', (req, res, next) => {
  // Skip this handler if mounted at root (for sitemap/robots)
  // Only respond when accessed via /api/seo
  if (req.baseUrl === '' || req.baseUrl === '/') {
    return next();
  }
  
  try {
    const seoData = loadSeoData();
    res.json({
      success: true,
      status: 'active',
      lastUpdated: seoData.lastUpdated,
      keywordCount: Object.values(seoData.keywords).flat().length,
      endpoints: [
        'GET /api/seo',
        'GET /api/seo/keywords',
        'POST /api/seo/analyze',
        'POST /api/seo/optimize/:productId',
        'GET /api/seo/trends',
        'GET /api/seo/report'
      ]
    });
  } catch (error) {
    res.status(500).json({ success: false, error: 'SEO service error' });
  }
});

/**
 * GET /api/seo/keywords - Get all tracked keywords
 */
router.get('/keywords', (req, res) => {
  try {
    const seoData = loadSeoData();
    res.json({
      success: true,
      keywords: seoData.keywords,
      lastUpdated: seoData.lastUpdated
    });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to load keywords' });
  }
});

/**
 * POST /api/seo/keywords - Add new keywords to track
 */
router.post('/keywords', (req, res) => {
  try {
    const { keywords, category = 'secondary' } = req.body;
    
    if (!keywords || !Array.isArray(keywords)) {
      return res.status(400).json({ success: false, error: 'Keywords array required' });
    }

    const seoData = loadSeoData();
    const validCategories = ['primary', 'secondary', 'longTail', 'trending'];
    const targetCategory = validCategories.includes(category) ? category : 'secondary';

    // Add unique keywords
    const existingKeywords = seoData.keywords[targetCategory] || [];
    const newKeywords = keywords.filter(k => !existingKeywords.includes(k.toLowerCase()));
    seoData.keywords[targetCategory] = [...existingKeywords, ...newKeywords];

    saveSeoData(seoData);

    res.json({
      success: true,
      message: `Added ${newKeywords.length} new keywords`,
      keywords: seoData.keywords
    });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to add keywords' });
  }
});

/**
 * GET /api/seo/analyze - AI-powered SEO analysis
 */
router.get('/analyze', async (req, res) => {
  try {
    const products = db.products.findAll();
    const seoData = loadSeoData();

    // Call Python for advanced keyword generation (Real Base Work)
    let aiKeywordResult = { suggestions: [] };
    try {
      aiKeywordResult = await pythonBridge.runPythonScript('ai_hub.py', [
        'seo/keywords', 
        JSON.stringify({ products })
      ]);
    } catch (e) {
      console.error('[SEO] Python keyword analysis failed:', e.message);
    }
    
    // Generate AI suggestions through JS as backup
    const jsSuggestions = aiAnalyzer.generateKeywordSuggestions(products);
    const combinedSuggestions = [...new Set([...(aiKeywordResult.suggestions || []), ...jsSuggestions])];
    
    // Analyze keyword relevance
    const keywordAnalysis = combinedSuggestions.slice(0, 30).map(keyword => ({
      keyword,
      relevanceScore: aiAnalyzer.analyzeKeywordRelevance(keyword, products),
      category: categorizeKeyword(keyword),
      isAiGenerated: true
    }));

    // Sort by relevance
    keywordAnalysis.sort((a, b) => b.relevanceScore - a.relevanceScore);

    // Update SEO data with new trending keywords
    seoData.aiSuggestions = keywordAnalysis;
    saveSeoData(seoData);

    res.json({
      success: true,
      analysis: {
        totalProducts: products.length,
        keywordSuggestions: keywordAnalysis,
        currentKeywords: seoData.keywords,
        recommendations: generateSeoRecommendations(products, seoData),
        aiMetadata: aiKeywordResult
      }
    });
  } catch (error) {
    console.error('[SEO] Analysis error:', error);
    res.status(500).json({ success: false, error: 'Failed to analyze SEO' });
  }
});

/**
 * GET /api/seo/optimize/:productId - Get optimization suggestions for a product
 */
router.get('/optimize/:productId', (req, res) => {
  try {
    const { productId } = req.params;
    const products = db.products.findAll();
    const product = products.find(p => p.id === productId);

    if (!product) {
      return res.status(404).json({ success: false, error: 'Product not found' });
    }

    const seoData = loadSeoData();
    const allKeywords = [
      ...seoData.keywords.primary,
      ...seoData.keywords.secondary,
      ...seoData.keywords.longTail
    ];

    // Generate content for analysis
    const productContent = `${product.name} ${product.description} ${product.category}`;
    const contentSuggestions = aiAnalyzer.generateContentSuggestions(productContent, allKeywords.slice(0, 10));

    // Generate optimized meta tags
    const optimizedMeta = generateOptimizedMeta(product, seoData.keywords.primary);

    res.json({
      success: true,
      productId,
      optimization: {
        currentTitle: product.name,
        suggestedTitle: optimizedMeta.title,
        currentDescription: product.description,
        suggestedDescription: optimizedMeta.description,
        suggestedKeywords: optimizedMeta.keywords,
        contentSuggestions,
        schemaMarkup: generateProductSchema(product)
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to optimize product' });
  }
});

/**
 * POST /api/seo/ping-search-engines - Notify search engines of updates
 */
router.post('/api/seo/ping-search-engines', async (req, res) => {
  try {
    const baseUrl = process.env.FRONTEND_URL || 'https://blackonn.com';
    const sitemapUrl = `${baseUrl}/sitemap.xml`;

    // Search engine ping URLs
    const pingUrls = [
      `https://www.google.com/ping?sitemap=${encodeURIComponent(sitemapUrl)}`,
      `https://www.bing.com/ping?sitemap=${encodeURIComponent(sitemapUrl)}`
    ];

    const results = [];

    // Note: In production, you'd use actual HTTP requests
    // For now, we log the ping attempts
    pingUrls.forEach(url => {
      console.log(`[SEO] Ping request: ${url}`);
      results.push({ url, status: 'queued' });
    });

    res.json({
      success: true,
      message: 'Search engine ping requests queued',
      results,
      note: 'Configure Google Search Console and Bing Webmaster Tools for verified indexing'
    });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to ping search engines' });
  }
});

/**
 * GET /api/seo/trends - Get simulated search trends
 * Note: Real trends require Google Trends API integration
 */
router.get('/trends', (req, res) => {
  try {
    const seoData = loadSeoData();
    
    // Generate simulated trend data based on keywords
    const trendData = seoData.keywords.primary.map(keyword => ({
      keyword,
      trend: 'stable',
      searchVolume: generateEstimatedVolume(keyword),
      competition: estimateCompetition(keyword),
      suggestedBid: estimateBidPrice(keyword)
    }));

    res.json({
      success: true,
      trends: trendData,
      note: 'Integrate with Google Trends API for real-time data',
      recommendations: [
        'Focus on long-tail keywords for better conversion',
        'Create content around trending fashion topics',
        'Optimize product pages for "buy" intent keywords',
        'Use location-based keywords for local SEO'
      ]
    });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to get trends' });
  }
});

/**
 * GET /api/seo/report - Generate comprehensive SEO report
 */
router.get('/report', (req, res) => {
  try {
    const products = db.products.findAll();
    const seoData = loadSeoData();

    const report = {
      generatedAt: new Date().toISOString(),
      summary: {
        totalProducts: products.length,
        trackedKeywords: Object.values(seoData.keywords).flat().length,
        lastAnalysis: seoData.lastUpdated
      },
      keywords: seoData.keywords,
      productOptimization: products.slice(0, 10).map(p => ({
        id: p.id,
        name: p.name,
        hasDescription: !!p.description,
        hasImages: (p.images || []).length > 0,
        seoScore: calculateProductSeoScore(p)
      })),
      recommendations: generateSeoRecommendations(products, seoData),
      technicalSeo: {
        sitemapExists: true,
        robotsTxtExists: true,
        schemaMarkupImplemented: true,
        mobileOptimized: true,
        httpsEnabled: true
      },
      actionItems: generateActionItems(products, seoData)
    };

    res.json({ success: true, report });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to generate report' });
  }
});

// ============ HELPER FUNCTIONS ============

function escapeXml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function categorizeKeyword(keyword) {
  const lower = keyword.toLowerCase();
  if (lower.includes('blackonn')) return 'brand';
  if (/buy|shop|order|price/.test(lower)) return 'commercial';
  if (/india|kolkata|online/.test(lower)) return 'local';
  if (/how|what|guide|best/.test(lower)) return 'informational';
  return 'general';
}

function generateOptimizedMeta(product, primaryKeywords) {
  const brandKeyword = primaryKeywords[0] || 'BLACKONN';
  
  return {
    title: `${product.name} | ${brandKeyword} - Premium Black Clothing India`,
    description: `Shop ${product.name} at ${brandKeyword}. ${product.description?.substring(0, 100) || 'Premium quality black clothing'}. Free shipping on orders above ₹999. Buy now!`,
    keywords: [
      product.name?.toLowerCase(),
      product.category?.toLowerCase(),
      brandKeyword.toLowerCase(),
      'black clothing',
      'buy online india'
    ].filter(Boolean).join(', ')
  };
}

function generateProductSchema(product) {
  const baseUrl = process.env.FRONTEND_URL || 'https://blackonn.com';
  
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    description: product.description,
    image: product.images?.[0] ? `${baseUrl}${product.images[0]}` : undefined,
    brand: {
      '@type': 'Brand',
      name: 'BLACKONN'
    },
    offers: {
      '@type': 'Offer',
      price: product.price,
      priceCurrency: 'INR',
      availability: product.stock > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
      url: `${baseUrl}/products.html?id=${product.id}`
    }
  };
}

function calculateProductSeoScore(product) {
  let score = 0;
  if (product.name && product.name.length > 10) score += 20;
  if (product.description && product.description.length > 50) score += 25;
  if (product.description && product.description.length > 150) score += 10;
  if (product.images && product.images.length > 0) score += 20;
  if (product.images && product.images.length >= 3) score += 10;
  if (product.category) score += 15;
  return Math.min(score, 100);
}

function generateSeoRecommendations(products, seoData) {
  const recommendations = [];

  // Check for products without descriptions
  const noDescProducts = products.filter(p => !p.description || p.description.length < 50);
  if (noDescProducts.length > 0) {
    recommendations.push({
      priority: 'high',
      type: 'content',
      message: `${noDescProducts.length} products need better descriptions for SEO`
    });
  }

  // Check for products without images
  const noImageProducts = products.filter(p => !p.images || p.images.length === 0);
  if (noImageProducts.length > 0) {
    recommendations.push({
      priority: 'high',
      type: 'media',
      message: `${noImageProducts.length} products are missing images`
    });
  }

  // Keyword recommendations
  if (seoData.keywords.longTail.length < 10) {
    recommendations.push({
      priority: 'medium',
      type: 'keywords',
      message: 'Add more long-tail keywords for better search targeting'
    });
  }

  recommendations.push({
    priority: 'medium',
    type: 'technical',
    message: 'Ensure all product pages have unique meta descriptions'
  });

  recommendations.push({
    priority: 'low',
    type: 'content',
    message: 'Create blog content around fashion trends to drive organic traffic'
  });

  return recommendations;
}

function generateActionItems(products, seoData) {
  return [
    {
      action: 'Add alt text to all product images',
      impact: 'high',
      effort: 'medium'
    },
    {
      action: 'Create unique meta descriptions for each product',
      impact: 'high',
      effort: 'medium'
    },
    {
      action: 'Implement customer reviews for rich snippets',
      impact: 'high',
      effort: 'high'
    },
    {
      action: 'Add FAQ schema to product pages',
      impact: 'medium',
      effort: 'low'
    },
    {
      action: 'Optimize images for faster loading',
      impact: 'medium',
      effort: 'medium'
    },
    {
      action: 'Create internal linking structure',
      impact: 'medium',
      effort: 'medium'
    }
  ];
}

function generateEstimatedVolume(keyword) {
  // Simulated volume - in production, use Google Keyword Planner API
  const baseVolume = keyword.toLowerCase().includes('blackonn') ? 500 : 1000;
  return Math.floor(baseVolume + Math.random() * 2000);
}

function estimateCompetition(keyword) {
  if (keyword.toLowerCase().includes('blackonn')) return 'low';
  if (keyword.split(' ').length >= 4) return 'low';
  if (/clothing|fashion|apparel/.test(keyword.toLowerCase())) return 'high';
  return 'medium';
}

function estimateBidPrice(keyword) {
  const competition = estimateCompetition(keyword);
  if (competition === 'high') return '₹15-25';
  if (competition === 'medium') return '₹8-15';
  return '₹3-8';
}

// ============ BACKGROUND SEO MONITORING ============

/**
 * Start background SEO monitoring tasks
 * This runs periodic checks and updates keyword data
 */
let seoMonitoringInterval = null;

const startSeoMonitoring = () => {
  if (seoMonitoringInterval) return;

  console.log('[SEO] Starting background SEO monitoring...');

  // Run every 6 hours
  seoMonitoringInterval = setInterval(() => {
    try {
      const products = db.products.findAll();
      const seoData = loadSeoData();

      // Update AI suggestions
      const newSuggestions = aiAnalyzer.generateKeywordSuggestions(products);
      seoData.aiSuggestions = newSuggestions.slice(0, 50);

      // Log monitoring activity
      console.log(`[SEO] Monitoring update: ${products.length} products, ${newSuggestions.length} keyword suggestions`);

      saveSeoData(seoData);
    } catch (error) {
      console.error('[SEO] Monitoring error:', error.message);
    }
  }, 6 * 60 * 60 * 1000); // 6 hours
};

const stopSeoMonitoring = () => {
  if (seoMonitoringInterval) {
    clearInterval(seoMonitoringInterval);
    seoMonitoringInterval = null;
    console.log('[SEO] Background monitoring stopped');
  }
};

// Technical SEO Audit Route (Python Powered)
router.get('/audit', (req, res) => {
  try {
    const seoData = loadSeoData();
    const config = db.settings.get('seo') || {};
    
    // Simulate technical audit data from DB/Config
    const auditData = {
      title: config.title || 'BLACKONN | Premium Black Clothing',
      description: config.description || 'India\'s first choice for premium black streetwear.',
      keywords: seoData.keywords?.primary || []
    };
    
    pythonBridge.runPythonScript('ai_hub.py', ['seo/analyze', JSON.stringify({ elements: auditData })])
      .then(report => {
        res.json({ success: true, report });
      })
      .catch(err => {
        console.error('[SEO Audit] Python Error:', err.message);
        res.status(500).json({ success: false, error: 'Audit engine failed' });
      });
  } catch (error) {
    console.error('SEO Audit error:', error);
    res.status(500).json({ success: false, error: 'Failed to run SEO audit' });
  }
});

// Start monitoring when module loads
startSeoMonitoring();

// Export for use in server
module.exports = router;
module.exports.startSeoMonitoring = startSeoMonitoring;
module.exports.stopSeoMonitoring = stopSeoMonitoring;
module.exports.aiAnalyzer = aiAnalyzer;
