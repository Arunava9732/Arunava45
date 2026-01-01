/**
 * Users Routes
 */

const express = require('express');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');
const db = require('../utils/database');
const { authenticate, isAdmin } = require('../middleware/auth');
const { validators, validateRequest, passwordResetLimiter } = require('../middleware/security');
const { body, param } = require('express-validator');

const router = express.Router();

// Upload directory for users
const USERS_UPLOAD_DIR = path.join(__dirname, '..', 'uploads', 'users');

// Helper to delete uploaded file
function deleteUploadedFile(filePath) {
  try {
    if (!filePath) return;
    
    // Extract filename from URL path
    let filename = filePath;
    if (filePath.includes('/uploads/users/')) {
      filename = filePath.split('/uploads/users/').pop();
    } else if (filePath.includes('/api/uploads/users/')) {
      filename = filePath.split('/api/uploads/users/').pop();
    }
    
    const fullPath = path.join(USERS_UPLOAD_DIR, filename);
    
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
      console.log('Deleted user file:', fullPath);
    }
  } catch (error) {
    console.error('Error deleting user file:', error);
  }
}

// Get all users (admin only)
router.get('/', authenticate, isAdmin, (req, res) => {
  try {
    const users = db.users.findAll();
    // Remove passwords from response
    const sanitized = users.map(({ password, ...user }) => user);
    res.json({ success: true, users: sanitized });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ success: false, error: 'Failed to get users' });
  }
});

// Get user by ID (admin or self)
router.get('/:id', authenticate, (req, res) => {
  try {
    if (req.user.role !== 'admin' && req.user.id !== req.params.id) {
      return res.status(403).json({ success: false, error: 'Not authorized' });
    }

    const user = db.users.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const { password, ...userWithoutPassword } = user;
    res.json({ success: true, user: userWithoutPassword });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ success: false, error: 'Failed to get user' });
  }
});

// Update user profile
router.put('/:id', authenticate, async (req, res) => {
  try {
    if (req.user.role !== 'admin' && req.user.id !== req.params.id) {
      return res.status(403).json({ success: false, error: 'Not authorized' });
    }

    const user = db.users.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const { name, phone, avatar, preferences, role } = req.body;
    const updates = { updatedAt: new Date().toISOString() };

    if (name) updates.name = name.trim();
    if (phone !== undefined) updates.phone = phone;
    if (avatar) updates.avatar = avatar;
    if (preferences) updates.preferences = { ...user.preferences, ...preferences };

    // Allow admins to update user role (but not their own role to prevent lockout)
    if (role && req.user.role === 'admin') {
      if (req.user.id === req.params.id) {
        return res.status(400).json({ success: false, error: 'You cannot change your own role' });
      }
      if (!['admin', 'customer'].includes(role)) {
        return res.status(400).json({ success: false, error: 'Invalid role. Must be "admin" or "customer"' });
      }
      updates.role = role;
    }

    const updated = db.users.update(req.params.id, updates);
    const { password, ...userWithoutPassword } = updated;

    res.json({ success: true, user: userWithoutPassword });
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ success: false, error: 'Failed to update user' });
  }
});

// Change password - with rate limiting and validation
router.post('/:id/change-password', 
  passwordResetLimiter,
  authenticate, 
  validateRequest([
    body('currentPassword').notEmpty().withMessage('Current password is required'),
    body('newPassword')
      .isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
      .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/).withMessage('Password must include uppercase, lowercase, number, and special character')
  ]),
  async (req, res) => {
  try {
    if (req.user.id !== req.params.id) {
      return res.status(403).json({ success: false, error: 'Not authorized' });
    }

    const { currentPassword, newPassword } = req.body;

    const user = db.users.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    // Verify current password
    const isValid = await bcrypt.compare(currentPassword, user.password);
    if (!isValid) {
      return res.status(401).json({ success: false, error: 'Current password is incorrect' });
    }

    // Hash new password with higher cost factor
    const hashedPassword = await bcrypt.hash(newPassword, 12);
    db.users.update(req.params.id, {
      password: hashedPassword,
      passwordChangedAt: new Date().toISOString()
    });

    res.json({ success: true, message: 'Password changed successfully' });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ success: false, error: 'Failed to change password' });
  }
});

// Delete user (admin only)
router.delete('/:id', authenticate, isAdmin, (req, res) => {
  try {
    // Get user first to access avatar path
    const user = db.users.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    
    // Delete avatar image if exists
    if (user.avatar) {
      deleteUploadedFile(user.avatar);
    }
    
    // Delete from database
    db.users.delete(req.params.id);

    // Also delete user's sessions
    const sessions = db.sessions.findAll();
    const filtered = sessions.filter(s => s.userId !== req.params.id);
    db.sessions.replaceAll(filtered);

    res.json({ success: true, message: 'User deleted' });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ success: false, error: 'Failed to delete user' });
  }
});

// Delete user account (GDPR)
router.delete('/:id', authenticate, async (req, res) => {
  try {
    if (req.user.role !== 'admin' && req.user.id !== req.params.id) {
      return res.status(403).json({ success: false, error: 'Not authorized' });
    }
    const user = db.users.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    // Remove user from DB
    db.users.delete(req.params.id);
    // Optionally, anonymize or delete related data (orders, wishlists, etc.)
    // ...existing code for related data cleanup...
    res.json({ success: true, message: 'Account deleted successfully' });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ success: false, error: 'Failed to delete account' });
  }
});

// Get user stats (admin only)
router.get('/stats/summary', authenticate, isAdmin, (req, res) => {
  try {
    const users = db.users.findAll();
    
    const stats = {
      totalUsers: users.length,
      activeUsers: users.filter(u => u.lastLogin && new Date(u.lastLogin) > new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)).length,
      newThisMonth: users.filter(u => new Date(u.createdAt) > new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)).length
    };

    res.json({ success: true, stats });
  } catch (error) {
    console.error('Get user stats error:', error);
    res.status(500).json({ success: false, error: 'Failed to get stats' });
  }
});

// =====================
// ADDRESS MANAGEMENT
// =====================

// GET /api/users/:id/addresses - Get user's addresses
router.get('/:id/addresses', authenticate, (req, res) => {
  try {
    if (req.user.role !== 'admin' && req.user.id !== req.params.id) {
      return res.status(403).json({ success: false, error: 'Not authorized' });
    }

    const user = db.users.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    res.json({ success: true, addresses: user.addresses || [] });
  } catch (error) {
    console.error('Get addresses error:', error);
    res.status(500).json({ success: false, error: 'Failed to get addresses' });
  }
});

// POST /api/users/:id/addresses - Add new address
router.post('/:id/addresses', authenticate, (req, res) => {
  try {
    if (req.user.role !== 'admin' && req.user.id !== req.params.id) {
      return res.status(403).json({ success: false, error: 'Not authorized' });
    }

    const user = db.users.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const { label, name, phone, street, city, state, pincode } = req.body;
    
    if (!label || !name || !street || !city || !state || !pincode) {
      return res.status(400).json({ success: false, error: 'All address fields are required' });
    }

    const newAddress = {
      id: `addr-${Date.now()}`,
      label,
      name,
      phone,
      street,
      city,
      state,
      pincode,
      createdAt: new Date().toISOString()
    };

    const addresses = user.addresses || [];
    addresses.push(newAddress);
    
    db.users.update(req.params.id, { addresses });

    res.status(201).json({ success: true, address: newAddress, addresses });
  } catch (error) {
    console.error('Add address error:', error);
    res.status(500).json({ success: false, error: 'Failed to add address' });
  }
});

// PUT /api/users/:id/addresses/:addressId - Update address
router.put('/:id/addresses/:addressId', authenticate, (req, res) => {
  try {
    if (req.user.role !== 'admin' && req.user.id !== req.params.id) {
      return res.status(403).json({ success: false, error: 'Not authorized' });
    }

    const user = db.users.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const addresses = user.addresses || [];
    const addrIndex = addresses.findIndex(a => a.id === req.params.addressId);
    
    if (addrIndex === -1) {
      return res.status(404).json({ success: false, error: 'Address not found' });
    }

    const { label, name, phone, street, city, state, pincode } = req.body;
    
    addresses[addrIndex] = {
      ...addresses[addrIndex],
      label: label || addresses[addrIndex].label,
      name: name || addresses[addrIndex].name,
      phone: phone || addresses[addrIndex].phone,
      street: street || addresses[addrIndex].street,
      city: city || addresses[addrIndex].city,
      state: state || addresses[addrIndex].state,
      pincode: pincode || addresses[addrIndex].pincode,
      updatedAt: new Date().toISOString()
    };

    db.users.update(req.params.id, { addresses });

    res.json({ success: true, address: addresses[addrIndex], addresses });
  } catch (error) {
    console.error('Update address error:', error);
    res.status(500).json({ success: false, error: 'Failed to update address' });
  }
});

// DELETE /api/users/:id/addresses/:addressId - Delete address
router.delete('/:id/addresses/:addressId', authenticate, (req, res) => {
  try {
    if (req.user.role !== 'admin' && req.user.id !== req.params.id) {
      return res.status(403).json({ success: false, error: 'Not authorized' });
    }

    const user = db.users.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const addresses = user.addresses || [];
    const addrIndex = addresses.findIndex(a => a.id === req.params.addressId);
    
    if (addrIndex === -1) {
      return res.status(404).json({ success: false, error: 'Address not found' });
    }

    const deletedAddress = addresses.splice(addrIndex, 1)[0];
    db.users.update(req.params.id, { addresses });

    res.json({ success: true, message: 'Address deleted', address: deletedAddress });
  } catch (error) {
    console.error('Delete address error:', error);
    res.status(500).json({ success: false, error: 'Failed to delete address' });
  }
});

module.exports = router;
