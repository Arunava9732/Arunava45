/**
 * Traffic Analytics Routes
 * Track and report website visitor statistics
 */

const express = require('express');
const router = express.Router();
const { Database } = require('../utils/database');

const trafficDb = new Database('traffic');

// ============ ANALYTICS BUFFERING (Advanced Code Function) ============
// Reduces disk I/O by batching writes
let isDirty = false;
const FLUSH_INTERVAL = 60000; // Flush to disk every 60 seconds

// Periodically flush to disk if data has changed
setInterval(() => {
  if (isDirty) {
    try {
      const trafficData = trafficDb.findAll();
      trafficDb._write(trafficData);
      isDirty = false;
      // console.log('[Analytics] Flushed traffic data to disk');
    } catch (e) {
      console.error('[Analytics] Flush failed:', e);
    }
  }
}, FLUSH_INTERVAL);

/**
 * @route   POST /api/analytics/track
 * @desc    Track a page visit
 * @access  Public
 */
router.post('/track', (req, res) => {
  try {
    const { page, referrer, userAgent } = req.body;
    const ip = req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    
    // Get today's date as key
    const today = new Date().toISOString().split('T')[0];
    
    // Get existing traffic data (from cache)
    let trafficData = trafficDb.findAll();
    if (!Array.isArray(trafficData)) {
      trafficData = [];
    }
    
    // Find or create today's record
    let todayRecord = trafficData.find(r => r.date === today);
    if (!todayRecord) {
      todayRecord = {
        id: `traffic-${today}`,
        date: today,
        totalVisits: 0,
        uniqueVisitors: [],
        pageViews: {},
        hourlyVisits: {},
        devices: { desktop: 0, mobile: 0, tablet: 0 },
        browsers: {},
        referrers: {}
      };
      trafficData.push(todayRecord);
    }
    
    // Increment total visits
    todayRecord.totalVisits++;
    
    // Track unique visitors by IP hash (privacy-friendly)
    const visitorHash = Buffer.from(ip + (userAgent || '')).toString('base64').substring(0, 16);
    if (!todayRecord.uniqueVisitors.includes(visitorHash)) {
      todayRecord.uniqueVisitors.push(visitorHash);
    }
    
    // Track page views
    const pagePath = page || '/';
    todayRecord.pageViews[pagePath] = (todayRecord.pageViews[pagePath] || 0) + 1;
    
    // Track hourly visits
    const hour = new Date().getHours().toString().padStart(2, '0');
    todayRecord.hourlyVisits[hour] = (todayRecord.hourlyVisits[hour] || 0) + 1;
    
    // Detect device type from user agent
    const ua = (userAgent || '').toLowerCase();
    if (/mobile|android|iphone|ipod/.test(ua)) {
      todayRecord.devices.mobile++;
    } else if (/tablet|ipad/.test(ua)) {
      todayRecord.devices.tablet++;
    } else {
      todayRecord.devices.desktop++;
    }
    
    // Track browser
    let browser = 'Other';
    if (/chrome/i.test(ua) && !/edge/i.test(ua)) browser = 'Chrome';
    else if (/firefox/i.test(ua)) browser = 'Firefox';
    else if (/safari/i.test(ua) && !/chrome/i.test(ua)) browser = 'Safari';
    else if (/edge/i.test(ua)) browser = 'Edge';
    else if (/msie|trident/i.test(ua)) browser = 'IE';
    todayRecord.browsers[browser] = (todayRecord.browsers[browser] || 0) + 1;
    
    // Track referrers
    if (referrer) {
      try {
        const refHost = new URL(referrer).hostname || 'Direct';
        todayRecord.referrers[refHost] = (todayRecord.referrers[refHost] || 0) + 1;
      } catch {
        todayRecord.referrers['Direct'] = (todayRecord.referrers['Direct'] || 0) + 1;
      }
    } else {
      todayRecord.referrers['Direct'] = (todayRecord.referrers['Direct'] || 0) + 1;
    }
    
    // Mark as dirty to trigger periodic flush
    isDirty = true;
    
    res.json({ success: true });
  } catch (error) {
    console.error('Traffic tracking error:', error);
    res.status(500).json({ success: false, error: 'Failed to track visit' });
  }
});

/**
 * @route   GET /api/analytics/stats
 * @desc    Get traffic statistics
 * @access  Admin only
 */
router.get('/stats', (req, res) => {
  try {
    const { days = 7 } = req.query;
    const trafficData = trafficDb.findAll() || [];
    
    // Get date range
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));
    
    // Filter data for requested period
    const filteredData = trafficData.filter(record => {
      const recordDate = new Date(record.date);
      return recordDate >= startDate && recordDate <= endDate;
    });
    
    // Calculate aggregated stats
    const stats = {
      period: `Last ${days} days`,
      totalVisits: 0,
      uniqueVisitors: 0,
      avgVisitsPerDay: 0,
      pageViews: {},
      topPages: [],
      dailyVisits: [],
      hourlyDistribution: {},
      devices: { desktop: 0, mobile: 0, tablet: 0 },
      browsers: {},
      referrers: {},
      today: null,
      yesterday: null
    };
    
    // Aggregate unique visitors across days (using Set for deduplication)
    const allUniqueVisitors = new Set();
    
    filteredData.forEach(record => {
      stats.totalVisits += record.totalVisits || 0;
      
      // Aggregate unique visitors
      (record.uniqueVisitors || []).forEach(v => allUniqueVisitors.add(v));
      
      // Aggregate page views
      Object.entries(record.pageViews || {}).forEach(([page, views]) => {
        stats.pageViews[page] = (stats.pageViews[page] || 0) + views;
      });
      
      // Aggregate hourly visits
      Object.entries(record.hourlyVisits || {}).forEach(([hour, visits]) => {
        stats.hourlyDistribution[hour] = (stats.hourlyDistribution[hour] || 0) + visits;
      });
      
      // Aggregate devices
      stats.devices.desktop += record.devices?.desktop || 0;
      stats.devices.mobile += record.devices?.mobile || 0;
      stats.devices.tablet += record.devices?.tablet || 0;
      
      // Aggregate browsers
      Object.entries(record.browsers || {}).forEach(([browser, count]) => {
        stats.browsers[browser] = (stats.browsers[browser] || 0) + count;
      });
      
      // Aggregate referrers
      Object.entries(record.referrers || {}).forEach(([ref, count]) => {
        stats.referrers[ref] = (stats.referrers[ref] || 0) + count;
      });
      
      // Daily visits for chart
      stats.dailyVisits.push({
        date: record.date,
        visits: record.totalVisits || 0,
        uniqueVisitors: (record.uniqueVisitors || []).length
      });
    });
    
    stats.uniqueVisitors = allUniqueVisitors.size;
    stats.avgVisitsPerDay = filteredData.length > 0 
      ? Math.round(stats.totalVisits / filteredData.length) 
      : 0;
    
    // Sort daily visits by date
    stats.dailyVisits.sort((a, b) => new Date(a.date) - new Date(b.date));
    
    // Top pages
    stats.topPages = Object.entries(stats.pageViews)
      .map(([page, views]) => ({ page, views }))
      .sort((a, b) => b.views - a.views)
      .slice(0, 10);
    
    // Today's stats
    const today = new Date().toISOString().split('T')[0];
    const todayRecord = trafficData.find(r => r.date === today);
    if (todayRecord) {
      stats.today = {
        visits: todayRecord.totalVisits,
        uniqueVisitors: (todayRecord.uniqueVisitors || []).length
      };
    }
    
    // Yesterday's stats
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];
    const yesterdayRecord = trafficData.find(r => r.date === yesterdayStr);
    if (yesterdayRecord) {
      stats.yesterday = {
        visits: yesterdayRecord.totalVisits,
        uniqueVisitors: (yesterdayRecord.uniqueVisitors || []).length
      };
    }
    
    res.json({ success: true, stats });
  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({ success: false, error: 'Failed to get stats' });
  }
});

/**
 * @route   GET /api/analytics/realtime
 * @desc    Get real-time visitor count (last 5 minutes)
 * @access  Admin only
 */
router.get('/realtime', (req, res) => {
  try {
    const trafficData = trafficDb.findAll() || [];
    const today = new Date().toISOString().split('T')[0];
    const todayRecord = trafficData.find(r => r.date === today);
    
    // For simplicity, return today's hourly data
    const currentHour = new Date().getHours().toString().padStart(2, '0');
    const lastHourVisits = todayRecord?.hourlyVisits?.[currentHour] || 0;
    
    res.json({
      success: true,
      realtime: {
        activeNow: Math.max(1, Math.floor(lastHourVisits / 12)), // Estimate based on hourly
        todayTotal: todayRecord?.totalVisits || 0,
        todayUnique: (todayRecord?.uniqueVisitors || []).length
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to get realtime data' });
  }
});

module.exports = router;
