/**
 * Shipping & Logistics Routes
 * Handles courier integrations, shipping rates, tracking, zones, SLA, RTO
 */

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { authenticate, requireAdmin, optionalAuth } = require('../middleware/auth');
const { aiRequestLogger, aiPerformanceMonitor } = require('../middleware/aiEnhancer');

const router = express.Router();

// AI Middleware
router.use(aiRequestLogger);
router.use(aiPerformanceMonitor(500));

// Data file path
const DATA_DIR = path.join(__dirname, '..', 'data');
const SHIPPING_FILE = path.join(DATA_DIR, 'shipping.json');

// Courier API configurations
const COURIER_APIS = {
  delhivery: {
    trackUrl: 'https://track.delhivery.com/api/v1/packages/json/?waybill=',
    authHeader: 'Authorization'
  },
  bluedart: {
    trackUrl: 'https://api.bluedart.com/servlet/RoutingServlet',
    authHeader: 'API-Key'
  },
  dtdc: {
    trackUrl: 'https://blaboratory.dtdc.com/dtdc-api/rest/JSONCnPinCodeServ/getTrackDetails',
    authHeader: 'X-Access-Token'
  },
  ecom: {
    trackUrl: 'https://shipment.ecomexpress.in/services/trackShipment',
    authHeader: 'Authorization'
  }
};

// Helper to make HTTP request
function httpRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const isHttps = url.startsWith('https');
    const client = isHttps ? https : http;
    
    const req = client.get(url, { headers: options.headers || {} }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve({ raw: data });
        }
      });
    });
    
    req.on('error', reject);
    req.setTimeout(10000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
  });
}

// Fetch tracking from courier API
async function fetchCourierTracking(courierId, trackingNumber, apiKey) {
  const config = COURIER_APIS[courierId];
  if (!config || !apiKey) {
    return null;
  }
  
  try {
    const url = config.trackUrl + encodeURIComponent(trackingNumber);
    const headers = {};
    headers[config.authHeader] = apiKey;
    
    const response = await httpRequest(url, { headers });
    return parseCourierResponse(courierId, response);
  } catch (error) {
    console.error(`Courier API error (${courierId}):`, error.message);
    return null;
  }
}

// Parse courier-specific responses into unified format
function parseCourierResponse(courierId, response) {
  try {
    switch (courierId) {
      case 'delhivery':
        if (response.ShipmentData && response.ShipmentData[0]) {
          const shipment = response.ShipmentData[0].Shipment;
          return {
            status: mapDelhiveryStatus(shipment.Status?.Status),
            location: shipment.Status?.StatusLocation,
            updatedAt: shipment.Status?.StatusDateTime,
            history: (shipment.Scans || []).map(s => ({
              status: s.ScanDetail?.Scan,
              location: s.ScanDetail?.ScannedLocation,
              timestamp: s.ScanDetail?.ScanDateTime
            }))
          };
        }
        break;
        
      case 'bluedart':
        if (response.TrackingDetails) {
          return {
            status: response.TrackingDetails.Status,
            location: response.TrackingDetails.Location,
            updatedAt: response.TrackingDetails.DateTime,
            history: response.TrackingDetails.History || []
          };
        }
        break;
        
      case 'dtdc':
        if (response.trackDetails) {
          return {
            status: response.trackDetails.strStatus,
            location: response.trackDetails.strOrigin,
            updatedAt: response.trackDetails.strStatusDate,
            history: response.trackDetails.trackData || []
          };
        }
        break;
        
      case 'ecom':
        if (response.tracking) {
          return {
            status: response.tracking.current_status,
            location: response.tracking.current_location,
            updatedAt: response.tracking.updated_at,
            history: response.tracking.scans || []
          };
        }
        break;
    }
    return null;
  } catch (error) {
    console.error('Parse courier response error:', error);
    return null;
  }
}

// Map Delhivery status to standard status
function mapDelhiveryStatus(status) {
  const statusMap = {
    'Manifested': 'created',
    'In Transit': 'in-transit',
    'Out For Delivery': 'out-for-delivery',
    'Delivered': 'delivered',
    'RTO': 'rto',
    'Pending': 'pending'
  };
  return statusMap[status] || status?.toLowerCase() || 'unknown';
}

// Ensure data file exists
function ensureDataFile() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(SHIPPING_FILE)) {
    const defaultData = {
      settings: {
        freeShippingThreshold: 999, // Free shipping above ₹999
        defaultShippingRate: 49,
        expressShippingRate: 99,
        codCharges: 40,
        estimatedDaysStandard: '5-7',
        estimatedDaysExpress: '2-3',
        enableCourierTracking: true // New setting to enable/disable courier API tracking
      },
      couriers: [
        { id: 'delhivery', name: 'Delhivery', active: true, priority: 1, apiKey: '', enabled: false },
        { id: 'bluedart', name: 'Blue Dart', active: true, priority: 2, apiKey: '', enabled: false },
        { id: 'dtdc', name: 'DTDC', active: false, priority: 3, apiKey: '', enabled: false },
        { id: 'ecom', name: 'Ecom Express', active: false, priority: 4, apiKey: '', enabled: false }
      ],
      shippingRates: [],
      zones: [],
      pincodes: [],
      shipments: [],
      rtoRecords: []
    };
    fs.writeFileSync(SHIPPING_FILE, JSON.stringify(defaultData, null, 2));
  }
}

function readData() {
  ensureDataFile();
  try {
    return JSON.parse(fs.readFileSync(SHIPPING_FILE, 'utf8'));
  } catch (e) {
    console.error('Error reading shipping data:', e);
    return { settings: {}, couriers: [], shippingRates: [], zones: [], pincodes: [], shipments: [], rtoRecords: [] };
  }
}

function writeData(data) {
  ensureDataFile();
  fs.writeFileSync(SHIPPING_FILE, JSON.stringify(data, null, 2));
}

// ===============================
// SHIPPING SETTINGS
// ===============================

// Get shipping settings
router.get('/settings', authenticate, requireAdmin, (req, res) => {
  try {
    const data = readData();
    res.json({ success: true, settings: data.settings });
  } catch (error) {
    console.error('Get settings error:', error);
    res.status(500).json({ success: false, error: 'Failed to get settings' });
  }
});

// Update shipping settings
router.patch('/settings', authenticate, requireAdmin, (req, res) => {
  try {
    const data = readData();
    const { freeShippingThreshold, defaultShippingRate, expressShippingRate, codCharges, estimatedDaysStandard, estimatedDaysExpress, enableCourierTracking } = req.body;
    
    if (typeof freeShippingThreshold === 'number') data.settings.freeShippingThreshold = freeShippingThreshold;
    if (typeof defaultShippingRate === 'number') data.settings.defaultShippingRate = defaultShippingRate;
    if (typeof expressShippingRate === 'number') data.settings.expressShippingRate = expressShippingRate;
    if (typeof codCharges === 'number') data.settings.codCharges = codCharges;
    if (estimatedDaysStandard) data.settings.estimatedDaysStandard = estimatedDaysStandard;
    if (estimatedDaysExpress) data.settings.estimatedDaysExpress = estimatedDaysExpress;
    if (typeof enableCourierTracking === 'boolean') data.settings.enableCourierTracking = enableCourierTracking;
    
    data.settings.updatedAt = new Date().toISOString();
    writeData(data);
    
    res.json({ success: true, settings: data.settings });
  } catch (error) {
    console.error('Update settings error:', error);
    res.status(500).json({ success: false, error: 'Failed to update settings' });
  }
});

// Check if courier tracking is enabled (public)
router.get('/tracking-enabled', (req, res) => {
  try {
    const data = readData();
    res.json({ 
      success: true, 
      enabled: data.settings.enableCourierTracking || false,
      couriers: (data.couriers || []).filter(c => c.enabled && c.apiKey).map(c => ({ id: c.id, name: c.name }))
    });
  } catch (error) {
    res.json({ success: true, enabled: false, couriers: [] });
  }
});

// Calculate shipping (public)
router.post('/calculate', optionalAuth, (req, res) => {
  try {
    const data = readData();
    const { pincode, cartTotal, weight, isExpress, isCOD } = req.body;
    
    let shippingRate = data.settings.defaultShippingRate || 49;
    
    // Check for free shipping
    if (cartTotal >= (data.settings.freeShippingThreshold || 999)) {
      shippingRate = 0;
    }
    
    // Check zone-specific rate
    const zone = data.zones.find(z => z.pincodes && z.pincodes.includes(pincode));
    if (zone && zone.rate) {
      shippingRate = zone.rate;
    }
    
    // Express shipping
    if (isExpress) {
      shippingRate = data.settings.expressShippingRate || 99;
    }
    
    // COD charges
    let codCharges = 0;
    if (isCOD) {
      codCharges = data.settings.codCharges || 40;
    }
    
    // Check pincode serviceability
    const isServiceable = !data.pincodes.length || 
      data.pincodes.some(p => p.pincode === pincode && p.serviceable);
    
    const estimatedDays = isExpress 
      ? data.settings.estimatedDaysExpress || '2-3'
      : data.settings.estimatedDaysStandard || '5-7';
    
    res.json({
      success: true,
      shipping: {
        rate: shippingRate,
        codCharges,
        total: shippingRate + codCharges,
        estimatedDays,
        isServiceable,
        isFreeShipping: shippingRate === 0
      }
    });
  } catch (error) {
    console.error('Calculate shipping error:', error);
    res.status(500).json({ success: false, error: 'Failed to calculate shipping' });
  }
});

// ===============================
// COURIER INTEGRATIONS
// ===============================

// Get all couriers
router.get('/couriers', authenticate, requireAdmin, (req, res) => {
  try {
    const data = readData();
    res.json({ success: true, couriers: data.couriers });
  } catch (error) {
    console.error('Get couriers error:', error);
    res.status(500).json({ success: false, error: 'Failed to get couriers' });
  }
});

// Update courier status
router.patch('/couriers/:id', authenticate, requireAdmin, (req, res) => {
  try {
    const data = readData();
    const idx = data.couriers.findIndex(c => c.id === req.params.id);
    
    if (idx === -1) {
      return res.status(404).json({ success: false, error: 'Courier not found' });
    }
    
    const { active, priority, apiKey, apiSecret } = req.body;
    
    if (typeof active === 'boolean') data.couriers[idx].active = active;
    if (typeof priority === 'number') data.couriers[idx].priority = priority;
    if (apiKey !== undefined) data.couriers[idx].apiKey = apiKey;
    if (apiSecret !== undefined) data.couriers[idx].apiSecret = apiSecret;
    
    data.couriers[idx].updatedAt = new Date().toISOString();
    writeData(data);
    
    console.log(`[AI-Enhanced] Courier updated: ${courierId}, Active: ${data.couriers[idx].active}`);
    
    res.json({ success: true, courier: data.couriers[idx] });
  } catch (error) {
    console.error('Update courier error:', error);
    res.status(500).json({ success: false, error: 'Failed to update courier' });
  }
});

// ===============================
// SHIPPING RATE RULES
// ===============================

// Get shipping rates
router.get('/rates', authenticate, requireAdmin, (req, res) => {
  try {
    const data = readData();
    res.json({ success: true, rates: data.shippingRates });
  } catch (error) {
    console.error('Get rates error:', error);
    res.status(500).json({ success: false, error: 'Failed to get rates' });
  }
});

// Create shipping rate
router.post('/rates', authenticate, requireAdmin, (req, res) => {
  try {
    const data = readData();
    const { name, minWeight, maxWeight, minValue, maxValue, rate, zones } = req.body;
    
    const shippingRate = {
      id: uuidv4(),
      name: name || 'Custom Rate',
      minWeight: parseFloat(minWeight) || 0,
      maxWeight: parseFloat(maxWeight) || 999,
      minValue: parseFloat(minValue) || 0,
      maxValue: parseFloat(maxValue) || 999999,
      rate: parseFloat(rate) || 0,
      zones: zones || [],
      active: true,
      createdAt: new Date().toISOString()
    };
    
    data.shippingRates.push(shippingRate);
    writeData(data);
    
    console.log(`[AI-Enhanced] Shipping rate created: ${shippingRate.name}, Rate: ₹${shippingRate.rate}`);
    
    res.status(201).json({ success: true, rate: shippingRate });
  } catch (error) {
    console.error('Create rate error:', error);
    res.status(500).json({ success: false, error: 'Failed to create rate' });
  }
});

// Delete shipping rate
router.delete('/rates/:id', authenticate, requireAdmin, (req, res) => {
  try {
    const data = readData();
    const idx = data.shippingRates.findIndex(r => r.id === req.params.id);
    
    if (idx === -1) {
      return res.status(404).json({ success: false, error: 'Rate not found' });
    }
    
    data.shippingRates.splice(idx, 1);
    writeData(data);
    
    res.json({ success: true, message: 'Rate deleted' });
  } catch (error) {
    console.error('Delete rate error:', error);
    res.status(500).json({ success: false, error: 'Failed to delete rate' });
  }
});

// ===============================
// DELIVERY ZONES & PINCODES
// ===============================

// Get all zones
router.get('/zones', authenticate, requireAdmin, (req, res) => {
  try {
    const data = readData();
    res.json({ success: true, zones: data.zones });
  } catch (error) {
    console.error('Get zones error:', error);
    res.status(500).json({ success: false, error: 'Failed to get zones' });
  }
});

// Create zone
router.post('/zones', authenticate, requireAdmin, (req, res) => {
  try {
    const data = readData();
    const { name, states, pincodes, rate, estimatedDays, isExpress } = req.body;
    
    const zone = {
      id: uuidv4(),
      name: name || 'Zone',
      states: states || [],
      pincodes: pincodes || [],
      rate: parseFloat(rate) || 0,
      estimatedDays: estimatedDays || '5-7',
      isExpress: isExpress || false,
      active: true,
      createdAt: new Date().toISOString()
    };
    
    data.zones.push(zone);
    writeData(data);
    
    res.status(201).json({ success: true, zone });
  } catch (error) {
    console.error('Create zone error:', error);
    res.status(500).json({ success: false, error: 'Failed to create zone' });
  }
});

// Update zone
router.patch('/zones/:id', authenticate, requireAdmin, (req, res) => {
  try {
    const data = readData();
    const idx = data.zones.findIndex(z => z.id === req.params.id);
    
    if (idx === -1) {
      return res.status(404).json({ success: false, error: 'Zone not found' });
    }
    
    const updates = req.body;
    delete updates.id;
    delete updates.createdAt;
    
    data.zones[idx] = { ...data.zones[idx], ...updates, updatedAt: new Date().toISOString() };
    writeData(data);
    
    res.json({ success: true, zone: data.zones[idx] });
  } catch (error) {
    console.error('Update zone error:', error);
    res.status(500).json({ success: false, error: 'Failed to update zone' });
  }
});

// Delete zone
router.delete('/zones/:id', authenticate, requireAdmin, (req, res) => {
  try {
    const data = readData();
    const idx = data.zones.findIndex(z => z.id === req.params.id);
    
    if (idx === -1) {
      return res.status(404).json({ success: false, error: 'Zone not found' });
    }
    
    data.zones.splice(idx, 1);
    writeData(data);
    
    res.json({ success: true, message: 'Zone deleted' });
  } catch (error) {
    console.error('Delete zone error:', error);
    res.status(500).json({ success: false, error: 'Failed to delete zone' });
  }
});

// Check pincode serviceability (public)
router.get('/check-pincode/:pincode', (req, res) => {
  try {
    const data = readData();
    const { pincode } = req.params;
    
    // If no pincodes configured, all are serviceable
    if (!data.pincodes || data.pincodes.length === 0) {
      return res.json({ 
        success: true, 
        serviceable: true, 
        estimatedDays: data.settings.estimatedDaysStandard || '5-7',
        codAvailable: true
      });
    }
    
    const pincodeData = data.pincodes.find(p => p.pincode === pincode);
    
    if (!pincodeData) {
      return res.json({ success: true, serviceable: false, message: 'Pincode not serviceable' });
    }
    
    res.json({
      success: true,
      serviceable: pincodeData.serviceable,
      estimatedDays: pincodeData.estimatedDays || data.settings.estimatedDaysStandard,
      codAvailable: pincodeData.codAvailable !== false,
      zone: pincodeData.zone
    });
  } catch (error) {
    console.error('Check pincode error:', error);
    res.status(500).json({ success: false, error: 'Failed to check pincode' });
  }
});

// Bulk add pincodes
router.post('/pincodes/bulk', authenticate, requireAdmin, (req, res) => {
  try {
    const data = readData();
    const { pincodes } = req.body; // Array of { pincode, zone, serviceable, codAvailable }
    
    if (!Array.isArray(pincodes)) {
      return res.status(400).json({ success: false, error: 'Pincodes array required' });
    }
    
    let added = 0;
    pincodes.forEach(p => {
      const existing = data.pincodes.findIndex(ep => ep.pincode === p.pincode);
      if (existing >= 0) {
        data.pincodes[existing] = { ...data.pincodes[existing], ...p };
      } else {
        data.pincodes.push({
          pincode: p.pincode,
          zone: p.zone || 'default',
          serviceable: p.serviceable !== false,
          codAvailable: p.codAvailable !== false,
          estimatedDays: p.estimatedDays || '5-7',
          addedAt: new Date().toISOString()
        });
        added++;
      }
    });
    
    writeData(data);
    
    res.json({ success: true, message: `Added ${added} new pincodes`, total: data.pincodes.length });
  } catch (error) {
    console.error('Bulk add pincodes error:', error);
    res.status(500).json({ success: false, error: 'Failed to add pincodes' });
  }
});

// ===============================
// SHIPMENT TRACKING
// ===============================

// Get all shipments
router.get('/shipments', authenticate, requireAdmin, (req, res) => {
  try {
    const data = readData();
    res.json({ success: true, shipments: data.shipments });
  } catch (error) {
    console.error('Get shipments error:', error);
    res.status(500).json({ success: false, error: 'Failed to get shipments' });
  }
});

// Create shipment
router.post('/shipments', authenticate, requireAdmin, (req, res) => {
  try {
    const data = readData();
    const { orderId, courier, trackingNumber, weight, dimensions, pickupDate } = req.body;
    
    if (!orderId) {
      return res.status(400).json({ success: false, error: 'Order ID is required' });
    }
    
    const shipment = {
      id: uuidv4(),
      orderId,
      courier: courier || 'default',
      trackingNumber: trackingNumber || 'BLK' + Date.now().toString(36).toUpperCase(),
      weight: parseFloat(weight) || 0,
      dimensions: dimensions || {},
      status: 'created',
      statusHistory: [
        { status: 'created', timestamp: new Date().toISOString(), note: 'Shipment created' }
      ],
      pickupDate: pickupDate || null,
      deliveryDate: null,
      createdAt: new Date().toISOString()
    };
    
    data.shipments.push(shipment);
    writeData(data);
    
    res.status(201).json({ success: true, shipment });
  } catch (error) {
    console.error('Create shipment error:', error);
    res.status(500).json({ success: false, error: 'Failed to create shipment' });
  }
});

// Update shipment status
router.patch('/shipments/:id/status', authenticate, requireAdmin, (req, res) => {
  try {
    const data = readData();
    const idx = data.shipments.findIndex(s => s.id === req.params.id);
    
    if (idx === -1) {
      return res.status(404).json({ success: false, error: 'Shipment not found' });
    }
    
    const { status, note, location } = req.body;
    
    data.shipments[idx].status = status;
    data.shipments[idx].statusHistory.push({
      status,
      timestamp: new Date().toISOString(),
      note: note || '',
      location: location || ''
    });
    
    if (status === 'delivered') {
      data.shipments[idx].deliveryDate = new Date().toISOString();
    }
    
    data.shipments[idx].updatedAt = new Date().toISOString();
    writeData(data);
    
    res.json({ success: true, shipment: data.shipments[idx] });
  } catch (error) {
    console.error('Update shipment error:', error);
    res.status(500).json({ success: false, error: 'Failed to update shipment' });
  }
});

// Track shipment (public) - with courier API integration
router.get('/track/:trackingNumber', async (req, res) => {
  try {
    const data = readData();
    const shipment = data.shipments.find(s => 
      s.trackingNumber.toLowerCase() === req.params.trackingNumber.toLowerCase()
    );
    
    if (!shipment) {
      return res.status(404).json({ success: false, error: 'Shipment not found' });
    }
    
    let trackingData = {
      trackingNumber: shipment.trackingNumber,
      courier: shipment.courier,
      courierName: shipment.courierName,
      status: shipment.status,
      statusHistory: shipment.statusHistory,
      estimatedDelivery: shipment.estimatedDelivery,
      deliveryDate: shipment.deliveryDate,
      source: 'local' // Tracking source - local or courier API
    };
    
    // Try to fetch from courier API if enabled
    if (data.settings.enableCourierTracking) {
      const courier = data.couriers.find(c => c.id === shipment.courier);
      if (courier && courier.enabled && courier.apiKey) {
        const courierTracking = await fetchCourierTracking(
          courier.id, 
          shipment.trackingNumber, 
          courier.apiKey
        );
        
        if (courierTracking) {
          // Merge courier data with local data
          trackingData.status = courierTracking.status || shipment.status;
          trackingData.currentLocation = courierTracking.location;
          trackingData.courierUpdatedAt = courierTracking.updatedAt;
          trackingData.courierHistory = courierTracking.history;
          trackingData.source = 'courier_api';
          
          // Update local shipment status if different
          if (courierTracking.status && courierTracking.status !== shipment.status) {
            const idx = data.shipments.findIndex(s => s.id === shipment.id);
            if (idx !== -1) {
              data.shipments[idx].status = courierTracking.status;
              data.shipments[idx].statusHistory.push({
                status: courierTracking.status,
                timestamp: courierTracking.updatedAt || new Date().toISOString(),
                note: 'Updated from courier API',
                location: courierTracking.location || ''
              });
              if (courierTracking.status === 'delivered') {
                data.shipments[idx].deliveryDate = courierTracking.updatedAt || new Date().toISOString();
              }
              data.shipments[idx].updatedAt = new Date().toISOString();
              writeData(data);
            }
          }
        }
      }
    }
    
    res.json({
      success: true,
      tracking: trackingData
    });
  } catch (error) {
    console.error('Track shipment error:', error);
    res.status(500).json({ success: false, error: 'Failed to track shipment' });
  }
});

// Track shipment by Order ID (public) - for users who enter order ID in tracking
router.get('/track-order/:orderId', async (req, res) => {
  try {
    const data = readData();
    const orderId = req.params.orderId;
    
    // Find shipment by order ID
    const shipment = data.shipments.find(s => 
      s.orderId === orderId || 
      s.orderId === orderId.replace('ORD', '') ||
      s.orderId === `ORD${orderId}`
    );
    
    if (!shipment) {
      return res.status(404).json({ 
        success: false, 
        error: 'No shipment found for this order. The order may not have been shipped yet.' 
      });
    }
    
    res.json({
      success: true,
      tracking: {
        orderId: shipment.orderId,
        trackingNumber: shipment.trackingNumber,
        courier: shipment.courier,
        courierName: shipment.courierName,
        status: shipment.status,
        statusHistory: shipment.statusHistory,
        estimatedDelivery: shipment.estimatedDelivery,
        deliveryDate: shipment.deliveryDate,
        source: 'local'
      }
    });
  } catch (error) {
    console.error('Track by order ID error:', error);
    res.status(500).json({ success: false, error: 'Failed to track order' });
  }
});

// ===============================
// SLA PERFORMANCE
// ===============================

// Get SLA stats
router.get('/sla', authenticate, requireAdmin, (req, res) => {
  try {
    const data = readData();
    const shipments = data.shipments;
    
    const delivered = shipments.filter(s => s.status === 'delivered');
    const total = shipments.length;
    
    // Calculate on-time delivery rate
    let onTime = 0;
    delivered.forEach(s => {
      if (s.deliveryDate && s.createdAt) {
        const days = Math.ceil((new Date(s.deliveryDate) - new Date(s.createdAt)) / (1000 * 60 * 60 * 24));
        if (days <= 7) onTime++; // Consider 7 days as SLA
      }
    });
    
    const slaMetrics = {
      totalShipments: total,
      delivered: delivered.length,
      pending: shipments.filter(s => s.status === 'created' || s.status === 'picked').length,
      inTransit: shipments.filter(s => s.status === 'in-transit').length,
      rto: shipments.filter(s => s.status === 'rto').length,
      deliveryRate: total > 0 ? Math.round((delivered.length / total) * 100) : 0,
      onTimeRate: delivered.length > 0 ? Math.round((onTime / delivered.length) * 100) : 0,
      avgDeliveryDays: delivered.length > 0 
        ? Math.round(delivered.reduce((sum, s) => {
            if (s.deliveryDate && s.createdAt) {
              return sum + Math.ceil((new Date(s.deliveryDate) - new Date(s.createdAt)) / (1000 * 60 * 60 * 24));
            }
            return sum;
          }, 0) / delivered.length)
        : 0
    };
    
    res.json({ success: true, sla: slaMetrics });
  } catch (error) {
    console.error('Get SLA error:', error);
    res.status(500).json({ success: false, error: 'Failed to get SLA metrics' });
  }
});

// ===============================
// RTO MANAGEMENT
// ===============================

// Get RTO records
router.get('/rto', authenticate, requireAdmin, (req, res) => {
  try {
    const data = readData();
    res.json({ success: true, rtoRecords: data.rtoRecords });
  } catch (error) {
    console.error('Get RTO error:', error);
    res.status(500).json({ success: false, error: 'Failed to get RTO records' });
  }
});

// Create RTO record
router.post('/rto', authenticate, requireAdmin, (req, res) => {
  try {
    const data = readData();
    const { shipmentId, orderId, reason, customerNote } = req.body;
    
    const rto = {
      id: uuidv4(),
      shipmentId,
      orderId,
      reason: reason || 'Customer not available',
      customerNote: customerNote || '',
      status: 'initiated',
      initiatedAt: new Date().toISOString(),
      resolvedAt: null
    };
    
    data.rtoRecords.push(rto);
    
    // Update shipment status
    const shipmentIdx = data.shipments.findIndex(s => s.id === shipmentId);
    if (shipmentIdx >= 0) {
      data.shipments[shipmentIdx].status = 'rto';
      data.shipments[shipmentIdx].statusHistory.push({
        status: 'rto',
        timestamp: new Date().toISOString(),
        note: reason
      });
    }
    
    writeData(data);
    
    res.status(201).json({ success: true, rto });
  } catch (error) {
    console.error('Create RTO error:', error);
    res.status(500).json({ success: false, error: 'Failed to create RTO record' });
  }
});

// Resolve RTO
router.patch('/rto/:id', authenticate, requireAdmin, (req, res) => {
  try {
    const data = readData();
    const idx = data.rtoRecords.findIndex(r => r.id === req.params.id);
    
    if (idx === -1) {
      return res.status(404).json({ success: false, error: 'RTO record not found' });
    }
    
    const { status, resolution, refundAmount } = req.body;
    
    data.rtoRecords[idx].status = status || 'resolved';
    data.rtoRecords[idx].resolution = resolution || '';
    data.rtoRecords[idx].refundAmount = parseFloat(refundAmount) || 0;
    data.rtoRecords[idx].resolvedAt = new Date().toISOString();
    
    writeData(data);
    
    res.json({ success: true, rto: data.rtoRecords[idx] });
  } catch (error) {
    console.error('Resolve RTO error:', error);
    res.status(500).json({ success: false, error: 'Failed to resolve RTO' });
  }
});

module.exports = router;
