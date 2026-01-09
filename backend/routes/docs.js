/**
 * AI-Friendly API Documentation
 * OpenAPI 3.0 Specification with semantic annotations
 */

const express = require('express');
const router = express.Router();

// API Documentation - Machine Readable OpenAPI 3.0
router.get('/', (req, res) => {
  const apiDocs = {
    openapi: '3.0.0',
    info: {
      title: 'BLACKONN E-Commerce API',
      version: '1.0.0',
      description: 'AI-friendly REST API for premium black clothing e-commerce platform',
      contact: {
        name: 'BLACKONN API Support',
        url: 'https://blackonn.com/contact',
        email: 'api@blackonn.com'
      },
      license: {
        name: 'Proprietary',
        url: 'https://blackonn.com/terms'
      }
    },
    servers: [
      {
        url: '/api',
        description: 'Production API Server'
      }
    ],
    tags: [
      { name: 'Products', description: 'Product catalog operations' },
      { name: 'Auth', description: 'Authentication and authorization' },
      { name: 'Cart', description: 'Shopping cart management' },
      { name: 'Orders', description: 'Order processing' },
      { name: 'Analytics', description: 'AI-powered analytics and insights' },
      { name: 'Health', description: 'System health monitoring' }
    ],
    paths: {
      '/products': {
        get: {
          tags: ['Products'],
          summary: 'Get all products',
          description: 'Returns a list of all available products with full metadata',
          operationId: 'getProducts',
          responses: {
            '200': {
              description: 'Successful response with product list',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean', example: true },
                      products: {
                        type: 'array',
                        items: { $ref: '#/components/schemas/Product' }
                      },
                      _metadata: { $ref: '#/components/schemas/Metadata' }
                    }
                  }
                }
              }
            }
          }
        }
      },
      '/products/{id}': {
        get: {
          tags: ['Products'],
          summary: 'Get product by ID',
          description: 'Returns a single product with detailed information',
          operationId: 'getProductById',
          parameters: [{
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string' },
            description: 'Product ID'
          }],
          responses: {
            '200': {
              description: 'Product found',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean' },
                      product: { $ref: '#/components/schemas/Product' },
                      _metadata: { $ref: '#/components/schemas/Metadata' }
                    }
                  }
                }
              }
            },
            '404': {
              description: 'Product not found',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Error' }
                }
              }
            }
          }
        }
      },
      '/analytics/stats': {
        get: {
          tags: ['Analytics'],
          summary: 'Get AI-powered analytics',
          description: 'Returns comprehensive analytics data with AI insights',
          operationId: 'getAnalytics',
          parameters: [{
            name: 'days',
            in: 'query',
            schema: { type: 'integer', default: 7 },
            description: 'Number of days to analyze'
          }],
          responses: {
            '200': {
              description: 'Analytics data retrieved',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean' },
                      stats: { type: 'object' },
                      insights: { type: 'array', items: { type: 'object' } },
                      _metadata: { $ref: '#/components/schemas/Metadata' }
                    }
                  }
                }
              }
            }
          }
        }
      },
      '/health': {
        get: {
          tags: ['Health'],
          summary: 'Health check endpoint',
          description: 'Returns system health status',
          operationId: 'healthCheck',
          responses: {
            '200': {
              description: 'System is healthy',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      status: { type: 'string', example: 'healthy' },
                      timestamp: { type: 'string', format: 'date-time' },
                      uptime: { type: 'number' },
                      _metadata: { $ref: '#/components/schemas/Metadata' }
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    components: {
      schemas: {
        Product: {
          type: 'object',
          required: ['id', 'name', 'price'],
          properties: {
            id: {
              type: 'string',
              description: 'Unique product identifier',
              example: 'prod-001'
            },
            name: {
              type: 'string',
              description: 'Product name',
              example: 'Oversized Black T-Shirt'
            },
            price: {
              type: 'number',
              description: 'Price in INR',
              example: 1499
            },
            description: {
              type: 'string',
              description: 'Product description'
            },
            image: {
              type: 'string',
              description: 'Main product image URL',
              example: '/uploads/products/tshirt.png'
            },
            thumbImages: {
              type: 'array',
              items: { type: 'string' },
              description: 'Array of thumbnail images'
            },
            color: {
              type: 'string',
              description: 'Available color',
              example: 'Black'
            },
            size: {
              type: 'string',
              description: 'Available sizes',
              example: 'S, M, L, XL, XXL'
            },
            position: {
              type: 'integer',
              description: 'Display position on homepage',
              example: 1
            }
          }
        },
        Metadata: {
          type: 'object',
          description: 'AI-friendly metadata included in all responses',
          properties: {
            timestamp: {
              type: 'string',
              format: 'date-time',
              description: 'Response timestamp'
            },
            endpoint: {
              type: 'string',
              description: 'API endpoint path'
            },
            method: {
              type: 'string',
              description: 'HTTP method used'
            },
            version: {
              type: 'string',
              description: 'API version',
              example: 'v1'
            },
            requestId: {
              type: 'string',
              description: 'Unique request identifier'
            },
            processingTime: {
              type: 'number',
              description: 'Processing time in milliseconds'
            },
            ai: {
              type: 'object',
              properties: {
                friendly: { type: 'boolean', example: true },
                structured: { type: 'boolean', example: true },
                machineReadable: { type: 'boolean', example: true },
                semantic: { type: 'boolean', example: true }
              }
            }
          }
        },
        Error: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              example: false
            },
            error: {
              type: 'object',
              properties: {
                message: { type: 'string' },
                type: { type: 'string' },
                code: { type: 'string' },
                statusCode: { type: 'integer' }
              }
            },
            _metadata: { $ref: '#/components/schemas/Metadata' }
          }
        }
      },
      securitySchemes: {
        cookieAuth: {
          type: 'apiKey',
          in: 'cookie',
          name: 'token',
          description: 'Session cookie authentication'
        }
      }
    },
    'x-ai-features': {
      semanticWeb: true,
      structuredData: 'JSON-LD',
      mlReadable: true,
      apiVersion: '1.0',
      rateLimit: {
        perMinute: 60,
        perHour: 1000
      },
      analytics: {
        enabled: true,
        aiPowered: true,
        realtime: true
      }
    }
  };

  res.json({
    success: true,
    documentation: apiDocs,
    _metadata: {
      timestamp: new Date().toISOString(),
      format: 'OpenAPI 3.0',
      machineReadable: true,
      aiOptimized: true
    }
  });
});

// Human-readable API documentation page
router.get('/ui', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>BLACKONN API Documentation</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', sans-serif; background: #0f172a; color: #e2e8f0; padding: 40px; }
        .container { max-width: 1200px; margin: 0 auto; }
        h1 { font-size: 2.5rem; margin-bottom: 10px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
        .subtitle { color: #94a3b8; margin-bottom: 40px; }
        .endpoint { background: #1e293b; border-radius: 12px; padding: 24px; margin-bottom: 20px; border-left: 4px solid #667eea; }
        .method { display: inline-block; padding: 4px 12px; border-radius: 6px; font-weight: 600; font-size: 0.85rem; margin-right: 10px; }
        .get { background: #10b981; color: #fff; }
        .post { background: #3b82f6; color: #fff; }
        .path { font-family: 'Courier New', monospace; color: #fbbf24; }
        .desc { margin-top: 12px; color: #cbd5e1; line-height: 1.6; }
        .badge { display: inline-block; padding: 2px 8px; background: #7c3aed; color: #fff; border-radius: 4px; font-size: 0.75rem; margin-left: 10px; }
        a { color: #60a5fa; text-decoration: none; }
        a:hover { text-decoration: underline; }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>🚀 BLACKONN API</h1>
        <p class="subtitle">AI-Friendly REST API · Version 1.0 · Machine Readable</p>
        
        <div class="endpoint">
          <span class="method get">GET</span>
          <span class="path">/api/products</span>
          <span class="badge">AI-Optimized</span>
          <div class="desc">Get all products with comprehensive metadata and structured data</div>
        </div>

        <div class="endpoint">
          <span class="method get">GET</span>
          <span class="path">/api/products/:id</span>
          <span class="badge">Semantic</span>
          <div class="desc">Get detailed product information by ID</div>
        </div>

        <div class="endpoint">
          <span class="method get">GET</span>
          <span class="path">/api/analytics/stats</span>
          <span class="badge">AI-Powered</span>
          <div class="desc">Get comprehensive analytics with AI-generated insights and predictions</div>
        </div>

        <div class="endpoint">
          <span class="method get">GET</span>
          <span class="path">/api/health</span>
          <span class="badge">Monitoring</span>
          <div class="desc">System health check endpoint with real-time metrics</div>
        </div>

        <div class="endpoint">
          <span class="method post">POST</span>
          <span class="path">/api/auth/login</span>
          <div class="desc">User authentication with secure session management</div>
        </div>

        <div class="endpoint">
          <span class="method post">POST</span>
          <span class="path">/api/orders</span>
          <div class="desc">Create new order with payment processing</div>
        </div>

        <p style="margin-top: 40px; color: #94a3b8;">
          📘 <a href="/api/docs">Machine-Readable OpenAPI 3.0 Spec</a> | 
          🔒 Authentication: Session Cookie | 
          💡 AI Features: Enabled
        </p>
      </div>
    </body>
    </html>
  `);
});

module.exports = router;
