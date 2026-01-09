/**
 * Tax & GST Settings Routes
 * Indian tax law for fashion products
 * GST rates: 5% for products under ₹1000, 12% for products ₹1000 and above
 */

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');
const { authenticate, requireAdmin, optionalAuth } = require('../middleware/auth');
const { aiRequestLogger, aiPerformanceMonitor } = require('../middleware/aiEnhancer');

const router = express.Router();

// AI Middleware
router.use(aiRequestLogger);
router.use(aiPerformanceMonitor(500));

// Data file path
const DATA_DIR = path.join(__dirname, '..', 'data');
const TAX_FILE = path.join(DATA_DIR, 'tax.json');

// Ensure data file exists
function ensureDataFile() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(TAX_FILE)) {
    const defaultData = {
      settings: {
        gstEnabled: true,
        gstNumber: '',
        businessName: 'Blackonn',
        businessAddress: '',
        stateCode: '19', // West Bengal default
        inclusiveGst: true, // Prices include GST
        showGstOnInvoice: true,
        invoiceEnabled: true,
        // Invoice customization settings
        invoicePrefix: 'INV',
        invoiceStartNumber: 1,
        lastInvoiceNumber: 0,
        invoiceLogo: '/assets/img/logo.png',
        invoiceFooter: 'Thank you for shopping with Blackonn! For any queries, contact support@blackonn.com',
        invoiceTerms: 'All products are subject to our return policy. Returns accepted within 7 days of delivery.',
        invoiceSignature: 'Authorized Signatory',
        bankDetails: {
          bankName: '',
          accountNumber: '',
          ifscCode: '',
          accountHolder: ''
        }
      },
      // Indian GST slab rates for fashion/apparel
      taxSlabs: [
        {
          id: 'slab-1',
          name: 'Lower Slab (Under ₹1000)',
          hsnCode: '6109', // T-shirts, singlets and other vests
          minPrice: 0,
          maxPrice: 999.99,
          cgstRate: 2.5,
          sgstRate: 2.5,
          igstRate: 5,
          description: 'Apparel priced below ₹1000',
          active: true
        },
        {
          id: 'slab-2',
          name: 'Higher Slab (₹1000 and above)',
          hsnCode: '6109',
          minPrice: 1000,
          maxPrice: 999999999,
          cgstRate: 6,
          sgstRate: 6,
          igstRate: 12,
          description: 'Apparel priced ₹1000 and above',
          active: true
        }
      ],
      // HSN codes for different product categories
      hsnCodes: [
        { code: '6109', description: 'T-shirts, singlets and other vests, knitted or crocheted', category: 'T-Shirts' },
        { code: '6105', description: 'Men\'s or boys\' shirts, knitted or crocheted', category: 'Shirts' },
        { code: '6106', description: 'Women\'s or girls\' blouses, shirts, knitted or crocheted', category: 'Blouses' },
        { code: '6203', description: 'Men\'s or boys\' suits, ensembles, jackets, trousers', category: 'Pants' },
        { code: '6204', description: 'Women\'s or girls\' suits, ensembles, jackets, dresses, skirts', category: 'Dresses' },
        { code: '6110', description: 'Jerseys, pullovers, cardigans, waistcoats, knitted or crocheted', category: 'Sweaters' },
        { code: '6115', description: 'Pantyhose, tights, stockings, socks, hosiery', category: 'Socks' },
        { code: '6211', description: 'Track suits, ski suits, swimwear, other garments', category: 'Activewear' }
      ],
      // State codes for GST
      stateCodes: [
        { code: '01', name: 'Jammu & Kashmir' },
        { code: '02', name: 'Himachal Pradesh' },
        { code: '03', name: 'Punjab' },
        { code: '04', name: 'Chandigarh' },
        { code: '05', name: 'Uttarakhand' },
        { code: '06', name: 'Haryana' },
        { code: '07', name: 'Delhi' },
        { code: '08', name: 'Rajasthan' },
        { code: '09', name: 'Uttar Pradesh' },
        { code: '10', name: 'Bihar' },
        { code: '11', name: 'Sikkim' },
        { code: '12', name: 'Arunachal Pradesh' },
        { code: '13', name: 'Nagaland' },
        { code: '14', name: 'Manipur' },
        { code: '15', name: 'Mizoram' },
        { code: '16', name: 'Tripura' },
        { code: '17', name: 'Meghalaya' },
        { code: '18', name: 'Assam' },
        { code: '19', name: 'West Bengal' },
        { code: '20', name: 'Jharkhand' },
        { code: '21', name: 'Odisha' },
        { code: '22', name: 'Chhattisgarh' },
        { code: '23', name: 'Madhya Pradesh' },
        { code: '24', name: 'Gujarat' },
        { code: '26', name: 'Dadra and Nagar Haveli and Daman & Diu' },
        { code: '27', name: 'Maharashtra' },
        { code: '28', name: 'Andhra Pradesh (Old)' },
        { code: '29', name: 'Karnataka' },
        { code: '30', name: 'Goa' },
        { code: '31', name: 'Lakshadweep' },
        { code: '32', name: 'Kerala' },
        { code: '33', name: 'Tamil Nadu' },
        { code: '34', name: 'Puducherry' },
        { code: '35', name: 'Andaman and Nicobar Islands' },
        { code: '36', name: 'Telangana' },
        { code: '37', name: 'Andhra Pradesh (New)' },
        { code: '38', name: 'Ladakh' }
      ],
      invoices: []
    };
    fs.writeFileSync(TAX_FILE, JSON.stringify(defaultData, null, 2));
  }
}

function readData() {
  ensureDataFile();
  try {
    return JSON.parse(fs.readFileSync(TAX_FILE, 'utf8'));
  } catch (e) {
    console.error('Error reading tax data:', e);
    return { settings: {}, taxSlabs: [], hsnCodes: [], stateCodes: [], invoices: [] };
  }
}

function writeData(data) {
  ensureDataFile();
  fs.writeFileSync(TAX_FILE, JSON.stringify(data, null, 2));
}

// ===============================
// TAX SETTINGS
// ===============================

// Get tax settings
router.get('/settings', authenticate, requireAdmin, (req, res) => {
  try {
    const data = readData();
    // Normalize boolean fields to ensure they're always true/false, never undefined
    const settings = {
      ...data.settings,
      gstEnabled: data.settings.gstEnabled === true,
      inclusiveGst: data.settings.inclusiveGst === true,
      showGstOnInvoice: data.settings.showGstOnInvoice === true,
      invoiceEnabled: data.settings.invoiceEnabled === true
    };
    res.json({ success: true, settings, stateCodes: data.stateCodes });
  } catch (error) {
    console.error('Get tax settings error:', error);
    res.status(500).json({ success: false, error: 'Failed to get tax settings' });
  }
});

// Update tax settings
router.patch('/settings', authenticate, requireAdmin, (req, res) => {
  try {
    const data = readData();
    const { gstEnabled, gstNumber, businessName, businessAddress, stateCode, inclusiveGst, showGstOnInvoice, invoiceEnabled } = req.body;
    
    if (typeof gstEnabled === 'boolean') data.settings.gstEnabled = gstEnabled;
    if (gstNumber !== undefined) data.settings.gstNumber = gstNumber;
    if (businessName) data.settings.businessName = businessName;
    if (businessAddress !== undefined) data.settings.businessAddress = businessAddress;
    if (stateCode) data.settings.stateCode = stateCode;
    if (typeof inclusiveGst === 'boolean') data.settings.inclusiveGst = inclusiveGst;
    if (typeof showGstOnInvoice === 'boolean') data.settings.showGstOnInvoice = showGstOnInvoice;
    if (typeof invoiceEnabled === 'boolean') data.settings.invoiceEnabled = invoiceEnabled;
    
    data.settings.updatedAt = new Date().toISOString();
    writeData(data);
    
    console.log(`[AI-Enhanced] Tax settings updated: GST Enabled: ${data.settings.gstEnabled}`);
    
    res.json({ success: true, settings: data.settings });
  } catch (error) {
    console.error('Update tax settings error:', error);
    res.status(500).json({ success: false, error: 'Failed to update settings' });
  }
});

// ===============================
// TAX SLABS
// ===============================

// Get all tax slabs
router.get('/slabs', authenticate, requireAdmin, (req, res) => {
  try {
    const data = readData();
    res.json({ success: true, slabs: data.taxSlabs });
  } catch (error) {
    console.error('Get slabs error:', error);
    res.status(500).json({ success: false, error: 'Failed to get tax slabs' });
  }
});

// Create tax slab
router.post('/slabs', authenticate, requireAdmin, (req, res) => {
  try {
    const data = readData();
    const { name, hsnCode, minPrice, maxPrice, cgstRate, sgstRate, igstRate, description } = req.body;
    
    if (!name || cgstRate === undefined || sgstRate === undefined) {
      return res.status(400).json({ success: false, error: 'Name, CGST rate and SGST rate are required' });
    }
    
    const slab = {
      id: uuidv4(),
      name,
      hsnCode: hsnCode || '6109',
      minPrice: parseFloat(minPrice) || 0,
      maxPrice: parseFloat(maxPrice) || 999999999,
      cgstRate: parseFloat(cgstRate),
      sgstRate: parseFloat(sgstRate),
      igstRate: parseFloat(igstRate) || (parseFloat(cgstRate) + parseFloat(sgstRate)),
      description: description || '',
      active: true,
      createdAt: new Date().toISOString()
    };
    
    data.taxSlabs.push(slab);
    writeData(data);
    
    res.status(201).json({ success: true, slab });
  } catch (error) {
    console.error('Create slab error:', error);
    res.status(500).json({ success: false, error: 'Failed to create tax slab' });
  }
});

// Update tax slab
router.patch('/slabs/:id', authenticate, requireAdmin, (req, res) => {
  try {
    const data = readData();
    const idx = data.taxSlabs.findIndex(s => s.id === req.params.id);
    
    if (idx === -1) {
      return res.status(404).json({ success: false, error: 'Tax slab not found' });
    }
    
    const updates = req.body;
    delete updates.id;
    delete updates.createdAt;
    
    // Recalculate IGST if CGST or SGST changed
    if (updates.cgstRate !== undefined || updates.sgstRate !== undefined) {
      const cgst = updates.cgstRate !== undefined ? parseFloat(updates.cgstRate) : data.taxSlabs[idx].cgstRate;
      const sgst = updates.sgstRate !== undefined ? parseFloat(updates.sgstRate) : data.taxSlabs[idx].sgstRate;
      updates.igstRate = cgst + sgst;
    }
    
    data.taxSlabs[idx] = { ...data.taxSlabs[idx], ...updates, updatedAt: new Date().toISOString() };
    writeData(data);
    
    res.json({ success: true, slab: data.taxSlabs[idx] });
  } catch (error) {
    console.error('Update slab error:', error);
    res.status(500).json({ success: false, error: 'Failed to update tax slab' });
  }
});

// Delete tax slab
router.delete('/slabs/:id', authenticate, requireAdmin, (req, res) => {
  try {
    const data = readData();
    const idx = data.taxSlabs.findIndex(s => s.id === req.params.id);
    
    if (idx === -1) {
      return res.status(404).json({ success: false, error: 'Tax slab not found' });
    }
    
    data.taxSlabs.splice(idx, 1);
    writeData(data);
    
    res.json({ success: true, message: 'Tax slab deleted' });
  } catch (error) {
    console.error('Delete slab error:', error);
    res.status(500).json({ success: false, error: 'Failed to delete tax slab' });
  }
});

// ===============================
// HSN CODES
// ===============================

// Get all HSN codes
router.get('/hsn', authenticate, requireAdmin, (req, res) => {
  try {
    const data = readData();
    res.json({ success: true, hsnCodes: data.hsnCodes });
  } catch (error) {
    console.error('Get HSN codes error:', error);
    res.status(500).json({ success: false, error: 'Failed to get HSN codes' });
  }
});

// Add HSN code
router.post('/hsn', authenticate, requireAdmin, (req, res) => {
  try {
    const data = readData();
    const { code, description, category } = req.body;
    
    if (!code) {
      return res.status(400).json({ success: false, error: 'HSN code is required' });
    }
    
    // Check for duplicate
    if (data.hsnCodes.some(h => h.code === code)) {
      return res.status(400).json({ success: false, error: 'HSN code already exists' });
    }
    
    const hsn = {
      id: `hsn_${Date.now()}`,
      code,
      description: description || '',
      category: category || 'General',
      addedAt: new Date().toISOString()
    };
    
    data.hsnCodes.push(hsn);
    writeData(data);
    
    res.status(201).json({ success: true, hsn });
  } catch (error) {
    console.error('Add HSN error:', error);
    res.status(500).json({ success: false, error: 'Failed to add HSN code' });
  }
});

// Update HSN code
router.patch('/hsn/:hsnId', authenticate, requireAdmin, (req, res) => {
  try {
    const { hsnId } = req.params;
    const { code, description, category } = req.body;
    const data = readData();
    
    // Find by id or by code
    const idx = data.hsnCodes.findIndex(h => h.id === hsnId || h.code === hsnId);
    if (idx === -1) {
      return res.status(404).json({ success: false, error: 'HSN code not found' });
    }
    
    // Check for duplicate code (if changing code)
    if (code && code !== data.hsnCodes[idx].code) {
      if (data.hsnCodes.some((h, i) => h.code === code && i !== idx)) {
        return res.status(400).json({ success: false, error: 'HSN code already exists' });
      }
    }
    
    if (code) data.hsnCodes[idx].code = code;
    if (description !== undefined) data.hsnCodes[idx].description = description;
    if (category) data.hsnCodes[idx].category = category;
    data.hsnCodes[idx].updatedAt = new Date().toISOString();
    
    // Ensure it has an id
    if (!data.hsnCodes[idx].id) {
      data.hsnCodes[idx].id = `hsn_${Date.now()}`;
    }
    
    writeData(data);
    
    res.json({ success: true, hsn: data.hsnCodes[idx] });
  } catch (error) {
    console.error('Update HSN error:', error);
    res.status(500).json({ success: false, error: 'Failed to update HSN code' });
  }
});

// Delete HSN code
router.delete('/hsn/:hsnId', authenticate, requireAdmin, (req, res) => {
  try {
    const { hsnId } = req.params;
    const data = readData();
    
    // Find by id or by code
    const idx = data.hsnCodes.findIndex(h => h.id === hsnId || h.code === hsnId);
    if (idx === -1) {
      return res.status(404).json({ success: false, error: 'HSN code not found' });
    }
    
    data.hsnCodes.splice(idx, 1);
    writeData(data);
    
    res.json({ success: true, message: 'HSN code deleted' });
  } catch (error) {
    console.error('Delete HSN error:', error);
    res.status(500).json({ success: false, error: 'Failed to delete HSN code' });
  }
});

// ===============================
// TAX CALCULATION (PUBLIC)
// ===============================

// Calculate tax for a product
router.post('/calculate', optionalAuth, (req, res) => {
  try {
    const data = readData();
    const { price, quantity, destinationState, hsnCode } = req.body;
    
    if (!data.settings.gstEnabled) {
      return res.json({
        success: true,
        tax: {
          taxable: false,
          price: parseFloat(price),
          taxAmount: 0,
          totalAmount: parseFloat(price) * (parseInt(quantity) || 1)
        }
      });
    }
    
    const productPrice = parseFloat(price) || 0;
    const qty = parseInt(quantity) || 1;
    
    // Find applicable slab
    const slab = data.taxSlabs.find(s => 
      s.active && 
      productPrice >= s.minPrice && 
      productPrice <= s.maxPrice
    );
    
    if (!slab) {
      return res.json({
        success: true,
        tax: {
          taxable: false,
          price: productPrice,
          taxAmount: 0,
          totalAmount: productPrice * qty
        }
      });
    }
    
    // Determine if IGST or CGST+SGST
    const isInterstate = destinationState && destinationState !== data.settings.stateCode;
    
    let taxDetails;
    
    if (data.settings.inclusiveGst) {
      // Price includes GST
      const rate = isInterstate ? slab.igstRate : (slab.cgstRate + slab.sgstRate);
      const basePrice = productPrice / (1 + (rate / 100));
      const taxAmount = productPrice - basePrice;
      
      taxDetails = {
        taxable: true,
        basePrice: Math.round(basePrice * 100) / 100,
        price: productPrice,
        hsnCode: hsnCode || slab.hsnCode,
        isInterstate,
        taxRate: rate,
        taxAmount: Math.round(taxAmount * 100) / 100,
        totalAmount: Math.round(productPrice * qty * 100) / 100
      };
      
      if (isInterstate) {
        taxDetails.igst = Math.round(taxAmount * 100) / 100;
      } else {
        taxDetails.cgst = Math.round((taxAmount / 2) * 100) / 100;
        taxDetails.sgst = Math.round((taxAmount / 2) * 100) / 100;
      }
    } else {
      // Price excludes GST
      const rate = isInterstate ? slab.igstRate : (slab.cgstRate + slab.sgstRate);
      const taxAmount = productPrice * (rate / 100);
      const totalPrice = productPrice + taxAmount;
      
      taxDetails = {
        taxable: true,
        basePrice: productPrice,
        price: Math.round(totalPrice * 100) / 100,
        hsnCode: hsnCode || slab.hsnCode,
        isInterstate,
        taxRate: rate,
        taxAmount: Math.round(taxAmount * 100) / 100,
        totalAmount: Math.round(totalPrice * qty * 100) / 100
      };
      
      if (isInterstate) {
        taxDetails.igst = Math.round(taxAmount * 100) / 100;
      } else {
        taxDetails.cgst = Math.round((taxAmount / 2) * 100) / 100;
        taxDetails.sgst = Math.round((taxAmount / 2) * 100) / 100;
      }
    }
    
    res.json({ success: true, tax: taxDetails });
  } catch (error) {
    console.error('Calculate tax error:', error);
    res.status(500).json({ success: false, error: 'Failed to calculate tax' });
  }
});

// Calculate tax for cart
router.post('/calculate-cart', optionalAuth, (req, res) => {
  try {
    const data = readData();
    const { items, destinationState } = req.body;
    
    if (!data.settings.gstEnabled) {
      const subtotal = items.reduce((sum, item) => sum + (parseFloat(item.price) * (parseInt(item.quantity) || 1)), 0);
      return res.json({
        success: true,
        cartTax: {
          taxable: false,
          subtotal,
          totalTax: 0,
          grandTotal: subtotal
        }
      });
    }
    
    let totalCgst = 0;
    let totalSgst = 0;
    let totalIgst = 0;
    let subtotal = 0;
    
    const isInterstate = destinationState && destinationState !== data.settings.stateCode;
    
    const itemTaxes = items.map(item => {
      const productPrice = parseFloat(item.price) || 0;
      const qty = parseInt(item.quantity) || 1;
      
      const slab = data.taxSlabs.find(s => 
        s.active && 
        productPrice >= s.minPrice && 
        productPrice <= s.maxPrice
      );
      
      if (!slab) {
        subtotal += productPrice * qty;
        return { ...item, taxAmount: 0 };
      }
      
      const rate = isInterstate ? slab.igstRate : (slab.cgstRate + slab.sgstRate);
      let basePrice, taxAmount;
      
      if (data.settings.inclusiveGst) {
        basePrice = productPrice / (1 + (rate / 100));
        taxAmount = productPrice - basePrice;
        subtotal += basePrice * qty;
      } else {
        basePrice = productPrice;
        taxAmount = productPrice * (rate / 100);
        subtotal += productPrice * qty;
      }
      
      if (isInterstate) {
        totalIgst += taxAmount * qty;
      } else {
        totalCgst += (taxAmount / 2) * qty;
        totalSgst += (taxAmount / 2) * qty;
      }
      
      return {
        ...item,
        basePrice: Math.round(basePrice * 100) / 100,
        taxRate: rate,
        taxAmount: Math.round(taxAmount * qty * 100) / 100
      };
    });
    
    const totalTax = totalCgst + totalSgst + totalIgst;
    
    res.json({
      success: true,
      cartTax: {
        taxable: true,
        isInterstate,
        items: itemTaxes,
        subtotal: Math.round(subtotal * 100) / 100,
        cgst: Math.round(totalCgst * 100) / 100,
        sgst: Math.round(totalSgst * 100) / 100,
        igst: Math.round(totalIgst * 100) / 100,
        totalTax: Math.round(totalTax * 100) / 100,
        grandTotal: Math.round((subtotal + totalTax) * 100) / 100
      }
    });
  } catch (error) {
    console.error('Calculate cart tax error:', error);
    res.status(500).json({ success: false, error: 'Failed to calculate cart tax' });
  }
});

// ===============================
// GST INVOICE
// ===============================

// Generate legacy GST invoice number (for internal/admin use)
function generateLegacyInvoiceNumber(stateCode) {
  const date = new Date();
  const fy = date.getMonth() >= 3 ? date.getFullYear() : date.getFullYear() - 1;
  const seq = Date.now().toString().slice(-6);
  return `BLK/${stateCode}/${fy}-${fy + 1 - 2000}/${seq}`;
}

// Create GST invoice
router.post('/invoice', authenticate, requireAdmin, (req, res) => {
  try {
    const data = readData();
    const { orderId, items, customerName, customerGstin, customerAddress, customerState, shippingCharges } = req.body;
    
    if (!orderId || !items || !items.length) {
      return res.status(400).json({ success: false, error: 'Order ID and items are required' });
    }
    
    const isInterstate = customerState && customerState !== data.settings.stateCode;
    
    let totalCgst = 0;
    let totalSgst = 0;
    let totalIgst = 0;
    let subtotal = 0;
    
    const invoiceItems = items.map(item => {
      const productPrice = parseFloat(item.price) || 0;
      const qty = parseInt(item.quantity) || 1;
      
      const slab = data.taxSlabs.find(s => 
        s.active && 
        productPrice >= s.minPrice && 
        productPrice <= s.maxPrice
      );
      
      const rate = slab ? (isInterstate ? slab.igstRate : (slab.cgstRate + slab.sgstRate)) : 0;
      let basePrice, taxAmount;
      
      if (data.settings.inclusiveGst && slab) {
        basePrice = productPrice / (1 + (rate / 100));
        taxAmount = productPrice - basePrice;
      } else {
        basePrice = productPrice;
        taxAmount = slab ? productPrice * (rate / 100) : 0;
      }
      
      subtotal += basePrice * qty;
      
      if (isInterstate) {
        totalIgst += taxAmount * qty;
      } else {
        totalCgst += (taxAmount / 2) * qty;
        totalSgst += (taxAmount / 2) * qty;
      }
      
      return {
        name: item.name,
        hsnCode: item.hsnCode || (slab ? slab.hsnCode : '6109'),
        quantity: qty,
        unitPrice: Math.round(basePrice * 100) / 100,
        taxRate: rate,
        cgst: isInterstate ? 0 : Math.round((taxAmount / 2) * 100) / 100,
        sgst: isInterstate ? 0 : Math.round((taxAmount / 2) * 100) / 100,
        igst: isInterstate ? Math.round(taxAmount * 100) / 100 : 0,
        totalAmount: Math.round((basePrice + taxAmount) * qty * 100) / 100
      };
    });
    
    const shipping = parseFloat(shippingCharges) || 0;
    const totalTax = totalCgst + totalSgst + totalIgst;
    
    const invoice = {
      id: uuidv4(),
      invoiceNumber: generateLegacyInvoiceNumber(data.settings.stateCode),
      orderId,
      invoiceDate: new Date().toISOString(),
      seller: {
        name: data.settings.businessName,
        gstin: data.settings.gstNumber,
        address: data.settings.businessAddress,
        stateCode: data.settings.stateCode
      },
      buyer: {
        name: customerName || 'Customer',
        gstin: customerGstin || '',
        address: customerAddress || '',
        stateCode: customerState || data.settings.stateCode
      },
      isInterstate,
      items: invoiceItems,
      subtotal: Math.round(subtotal * 100) / 100,
      shippingCharges: shipping,
      cgst: Math.round(totalCgst * 100) / 100,
      sgst: Math.round(totalSgst * 100) / 100,
      igst: Math.round(totalIgst * 100) / 100,
      totalTax: Math.round(totalTax * 100) / 100,
      grandTotal: Math.round((subtotal + totalTax + shipping) * 100) / 100,
      createdAt: new Date().toISOString()
    };
    
    data.invoices.push(invoice);
    writeData(data);
    
    res.status(201).json({ success: true, invoice });
  } catch (error) {
    console.error('Create invoice error:', error);
    res.status(500).json({ success: false, error: 'Failed to create invoice' });
  }
});

// Get invoices
router.get('/invoices', authenticate, requireAdmin, (req, res) => {
  try {
    const data = readData();
    res.json({ success: true, invoices: data.invoices });
  } catch (error) {
    console.error('Get invoices error:', error);
    res.status(500).json({ success: false, error: 'Failed to get invoices' });
  }
});

// Get single invoice
router.get('/invoices/:id', authenticate, requireAdmin, (req, res) => {
  try {
    const data = readData();
    const invoice = data.invoices.find(i => i.id === req.params.id || i.invoiceNumber === req.params.id);
    
    if (!invoice) {
      return res.status(404).json({ success: false, error: 'Invoice not found' });
    }
    
    res.json({ success: true, invoice });
  } catch (error) {
    console.error('Get invoice error:', error);
    res.status(500).json({ success: false, error: 'Failed to get invoice' });
  }
});

// GST Summary Report
router.get('/gst-report', authenticate, requireAdmin, (req, res) => {
  try {
    const data = readData();
    const { startDate, endDate } = req.query;
    
    let invoices = data.invoices;
    
    if (startDate) {
      invoices = invoices.filter(i => new Date(i.invoiceDate) >= new Date(startDate));
    }
    if (endDate) {
      invoices = invoices.filter(i => new Date(i.invoiceDate) <= new Date(endDate));
    }
    
    const report = {
      totalInvoices: invoices.length,
      totalSales: invoices.reduce((sum, i) => sum + i.grandTotal, 0),
      totalTaxable: invoices.reduce((sum, i) => sum + i.subtotal, 0),
      totalCgst: invoices.reduce((sum, i) => sum + i.cgst, 0),
      totalSgst: invoices.reduce((sum, i) => sum + i.sgst, 0),
      totalIgst: invoices.reduce((sum, i) => sum + i.igst, 0),
      totalGst: invoices.reduce((sum, i) => sum + i.totalTax, 0),
      intrastate: invoices.filter(i => !i.isInterstate).length,
      interstate: invoices.filter(i => i.isInterstate).length
    };
    
    // Round all values
    Object.keys(report).forEach(key => {
      if (typeof report[key] === 'number' && key.startsWith('total')) {
        report[key] = Math.round(report[key] * 100) / 100;
      }
    });
    
    res.json({ success: true, report });
  } catch (error) {
    console.error('GST report error:', error);
    res.status(500).json({ success: false, error: 'Failed to generate GST report' });
  }
});

// Public endpoint for feature visibility (invoice download enabled)
router.get('/feature-visibility', (req, res) => {
  try {
    const data = readData();
    // Return exact boolean value - false if explicitly set to false, true otherwise
    // This ensures the toggle in admin properly controls the profile page
    const invoiceEnabled = data.settings.invoiceEnabled === false ? false : true;
    const gstEnabled = data.settings.gstEnabled === false ? false : true;
    
    console.log('[Tax] Feature visibility - invoiceEnabled:', invoiceEnabled, 'raw value:', data.settings.invoiceEnabled);
    
    res.json({
      success: true,
      features: {
        invoiceEnabled: invoiceEnabled,
        gstEnabled: gstEnabled
      }
    });
  } catch (error) {
    console.error('Feature visibility error:', error);
    res.json({ success: true, features: { invoiceEnabled: true, gstEnabled: true } });
  }
});

// Generate invoice number
function generateInvoiceNumber(settings) {
  const prefix = settings.invoicePrefix || 'INV';
  const lastNumber = settings.lastInvoiceNumber || 0;
  const newNumber = lastNumber + 1;
  const date = new Date();
  const year = date.getFullYear().toString().slice(-2);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${prefix}-${year}${month}-${String(newNumber).padStart(5, '0')}`;
}

// Get invoice settings (for frontend display)
router.get('/invoice-settings', authenticate, requireAdmin, (req, res) => {
  try {
    const data = readData();
    res.json({
      success: true,
      settings: {
        invoiceEnabled: data.settings.invoiceEnabled === true,
        invoicePrefix: data.settings.invoicePrefix || 'INV',
        invoiceStartNumber: data.settings.invoiceStartNumber || 1,
        lastInvoiceNumber: data.settings.lastInvoiceNumber || 0,
        invoiceLogo: data.settings.invoiceLogo || '/assets/img/logo.png',
        invoiceFooter: data.settings.invoiceFooter || '',
        invoiceTerms: data.settings.invoiceTerms || '',
        invoiceSignature: data.settings.invoiceSignature || '',
        businessPan: data.settings.businessPan || '',
        bankDetails: data.settings.bankDetails || {}
      }
    });
  } catch (error) {
    console.error('Get invoice settings error:', error);
    res.status(500).json({ success: false, error: 'Failed to get invoice settings' });
  }
});

// Update invoice settings
router.patch('/invoice-settings', authenticate, requireAdmin, (req, res) => {
  try {
    const data = readData();
    const { invoiceEnabled, invoicePrefix, invoiceFooter, invoiceTerms, invoiceSignature, invoiceLogo, businessPan, bankDetails } = req.body;
    
    // Handle invoiceEnabled toggle
    if (typeof invoiceEnabled === 'boolean') data.settings.invoiceEnabled = invoiceEnabled;
    if (invoicePrefix !== undefined) data.settings.invoicePrefix = invoicePrefix;
    if (invoiceFooter !== undefined) data.settings.invoiceFooter = invoiceFooter;
    if (invoiceTerms !== undefined) data.settings.invoiceTerms = invoiceTerms;
    if (invoiceSignature !== undefined) data.settings.invoiceSignature = invoiceSignature;
    if (invoiceLogo !== undefined) data.settings.invoiceLogo = invoiceLogo;
    if (businessPan !== undefined) data.settings.businessPan = businessPan;
    if (bankDetails !== undefined) data.settings.bankDetails = bankDetails;
    
    writeData(data);
    res.json({ success: true, settings: data.settings });
  } catch (error) {
    console.error('Update invoice settings error:', error);
    res.status(500).json({ success: false, error: 'Failed to update invoice settings' });
  }
});

// Generate invoice for an order (for users to download)
router.get('/invoice/:orderId', optionalAuth, async (req, res) => {
  try {
    const { orderId } = req.params;
    const data = readData();
    
    // Check if invoice download is enabled
    if (data.settings.invoiceEnabled === false) {
      return res.status(403).json({ success: false, error: 'Invoice download is disabled' });
    }
    
    // Get order details from orders file
    const ordersPath = path.join(DATA_DIR, 'orders.json');
    let orders = [];
    if (fs.existsSync(ordersPath)) {
      orders = JSON.parse(fs.readFileSync(ordersPath, 'utf8'));
    }
    
    const order = orders.find(o => o.id === orderId);
    if (!order) {
      return res.status(404).json({ success: false, error: 'Order not found' });
    }
    
    // Check if invoice already exists for this order
    let invoice = (data.invoices || []).find(i => i.orderId === orderId);
    
    if (!invoice) {
      // Generate new invoice
      const invoiceNumber = generateInvoiceNumber(data.settings);
      
      // Calculate tax breakdown
      const items = order.items || [];
      let subtotal = 0;
      let totalCgst = 0;
      let totalSgst = 0;
      let totalIgst = 0;
      
      const isInterstate = order.shippingAddress?.stateCode !== data.settings.stateCode;
      
      const itemsWithTax = items.map(item => {
        const price = item.price || 0;
        const qty = item.quantity || 1;
        const lineTotal = price * qty;
        subtotal += lineTotal;
        
        // Find applicable tax slab
        const slab = (data.taxSlabs || []).find(s => 
          s.active && price >= s.minPrice && price <= s.maxPrice
        ) || { cgstRate: 2.5, sgstRate: 2.5, igstRate: 5 };
        
        let cgst = 0, sgst = 0, igst = 0;
        if (data.settings.inclusiveGst) {
          // Price includes GST, calculate backward
          if (isInterstate) {
            igst = lineTotal - (lineTotal / (1 + slab.igstRate / 100));
          } else {
            cgst = lineTotal - (lineTotal / (1 + slab.cgstRate / 100));
            sgst = cgst;
          }
        } else {
          // Price excludes GST
          if (isInterstate) {
            igst = lineTotal * (slab.igstRate / 100);
          } else {
            cgst = lineTotal * (slab.cgstRate / 100);
            sgst = lineTotal * (slab.sgstRate / 100);
          }
        }
        
        totalCgst += cgst;
        totalSgst += sgst;
        totalIgst += igst;
        
        return {
          ...item,
          lineTotal,
          cgst: Math.round(cgst * 100) / 100,
          sgst: Math.round(sgst * 100) / 100,
          igst: Math.round(igst * 100) / 100,
          hsnCode: slab.hsnCode || '6109',
          taxRate: isInterstate ? slab.igstRate : (slab.cgstRate + slab.sgstRate)
        };
      });
      
      invoice = {
        id: uuidv4(),
        invoiceNumber,
        orderId,
        orderNumber: order.orderNumber || orderId,
        createdAt: new Date().toISOString(),
        
        // Business details
        businessName: data.settings.businessName || 'Blackonn',
        businessAddress: data.settings.businessAddress || '',
        gstNumber: data.settings.gstNumber || '',
        businessPan: data.settings.businessPan || '',
        invoiceLogo: data.settings.invoiceLogo || '/assets/img/logo.png',
        businessStateCode: data.settings.stateCode || '27',
        
        // Customer details
        customerName: order.shippingAddress?.name || order.customerName || 'Customer',
        customerEmail: order.email || order.customerEmail || '',
        customerPhone: order.shippingAddress?.phone || order.phone || '',
        
        // Shipping address
        shippingAddress: order.shippingAddress || {},
        billingAddress: order.billingAddress || order.shippingAddress || {},
        
        // Items with tax breakdown
        items: itemsWithTax,
        
        // Amounts
        subtotal: Math.round(subtotal * 100) / 100,
        shippingCharge: order.shippingCharge || order.shipping || 0,
        discount: order.discount || 0,
        cgst: Math.round(totalCgst * 100) / 100,
        sgst: Math.round(totalSgst * 100) / 100,
        igst: Math.round(totalIgst * 100) / 100,
        total: order.total || order.amount || subtotal,
        
        isInterstate,
        
        // Invoice customization
        footer: data.settings.invoiceFooter || '',
        terms: data.settings.invoiceTerms || '',
        signature: data.settings.invoiceSignature || '',
        bankDetails: data.settings.bankDetails || {}
      };
      
      // Save invoice and update last invoice number
      if (!data.invoices) data.invoices = [];
      data.invoices.push(invoice);
      data.settings.lastInvoiceNumber = (data.settings.lastInvoiceNumber || 0) + 1;
      writeData(data);
    }
    
    res.json({ success: true, invoice, settings: {
      logo: data.settings.invoiceLogo || '/assets/img/logo.png',
      showGst: data.settings.showGstOnInvoice !== false,
      businessPan: data.settings.businessPan || ''
    }});
  } catch (error) {
    console.error('Generate invoice error:', error);
    res.status(500).json({ success: false, error: 'Failed to generate invoice' });
  }
});

module.exports = router;
