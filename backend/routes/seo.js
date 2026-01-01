/**
 * SEO Routes for BLACKONN
 * Generates dynamic sitemap.xml and robots.txt
 */

const express = require('express');
const db = require('../utils/database');
const path = require('path');

const router = express.Router();

/**
 * Generate dynamic sitemap.xml
 */
router.get('/sitemap.xml', (req, res) => {
  try {
    const products = db.products.findAll();
    const baseUrl = process.env.FRONTEND_URL || 'https://blackonn.com';
    
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';
    
    // Static pages
    const staticPages = [
      { url: '', priority: '1.0', changefreq: 'daily' },
      { url: '/products.html', priority: '0.9', changefreq: 'daily' },
      { url: '/contact.html', priority: '0.7', changefreq: 'monthly' },
      { url: '/shipping.html', priority: '0.6', changefreq: 'monthly' },
      { url: '/return-policy.html', priority: '0.6', changefreq: 'monthly' },
      { url: '/refund-policy.html', priority: '0.6', changefreq: 'monthly' },
      { url: '/privacy-policy.html', priority: '0.6', changefreq: 'monthly' },
      { url: '/terms.html', priority: '0.6', changefreq: 'monthly' }
    ];
    
    staticPages.forEach(page => {
      xml += '  <url>\n';
      xml += `    <loc>${baseUrl}${page.url}</loc>\n`;
      xml += `    <changefreq>${page.changefreq}</changefreq>\n`;
      xml += `    <priority>${page.priority}</priority>\n`;
      xml += '  </url>\n';
    });
    
    // Dynamic product pages
    products.forEach(product => {
      if (product.id) {
        xml += '  <url>\n';
        xml += `    <loc>${baseUrl}/products.html?id=${product.id}</loc>\n`;
        xml += '    <changefreq>weekly</changefreq>\n';
        xml += '    <priority>0.8</priority>\n';
        xml += '  </url>\n';
      }
    });
    
    xml += '</urlset>';
    
    res.header('Content-Type', 'application/xml');
    res.send(xml);
  } catch (error) {
    console.error('Sitemap generation error:', error);
    res.status(500).send('Error generating sitemap');
  }
});

/**
 * Dynamic robots.txt
 */
router.get('/robots.txt', (req, res) => {
  const baseUrl = process.env.FRONTEND_URL || 'https://blackonn.com';
  const robots = `# BLACKONN - robots.txt
User-agent: *
Allow: /

# Disallow sensitive pages
Disallow: /admin.html
Disallow: /profile.html
Disallow: /checkout.html
Disallow: /cart.html
Disallow: /login.html
Disallow: /signup.html
Disallow: /forgot-password.html
Disallow: /reset-password.html

# Disallow API
Disallow: /api/

# Sitemap location
Sitemap: ${baseUrl}/sitemap.xml
`;
  
  res.header('Content-Type', 'text/plain');
  res.send(robots);
});

module.exports = router;
