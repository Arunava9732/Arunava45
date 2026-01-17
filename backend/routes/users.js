/**
 * Users Routes
 */

const express = require('express');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const db = require('../utils/database');
const { addNotification } = require('../utils/adminNotificationStore');
const { authenticate, isAdmin } = require('../middleware/auth');
const { validators, validateRequest, passwordResetLimiter } = require('../middleware/security');
const { body, param } = require('express-validator');
const { aiRequestLogger, aiPerformanceMonitor } = require('../middleware/aiEnhancer');
const { sendPasswordResetOTP } = require('../utils/email');

const router = express.Router();

// AI Middleware
router.use(aiRequestLogger);
router.use(aiPerformanceMonitor(500));

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

// ==========================================
// DELETED USERS HELPERS
// ==========================================

const DELETED_USERS_FILE = path.join(__dirname, '..', 'data', 'deletedUsers.json');

function getDeletedUsers() {
  try {
    if (fs.existsSync(DELETED_USERS_FILE)) {
      const data = fs.readFileSync(DELETED_USERS_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Error reading deleted users:', error);
  }
  return [];
}

function saveDeletedUsers(users) {
  try {
    fs.writeFileSync(DELETED_USERS_FILE, JSON.stringify(users, null, 2));
    return true;
  } catch (error) {
    console.error('Error saving deleted users:', error);
    return false;
  }
}

function archiveDeletedUser(user, deletedBy, reason = '') {
  try {
    const deletedUsers = getDeletedUsers();
    
    // Get all user-related data for stats
    const orders = db.orders?.findAll()?.filter(o => o.userId === user.id || o.customerEmail === user.email) || [];
    const carts = db.carts.findAll();
    const userCart = carts[user.id] || [];
    const allWishlists = db.wishlists ? db.wishlists.findAll() : {};
    const userWishlist = allWishlists[user.id] || [];
    const returns = db.returns?.findAll()?.filter(r => r.userId === user.id) || [];

    const deletedUser = {
      deletedId: 'deleted_' + Date.now() + '_' + user.id,
      originalId: user.id,
      userData: {
        name: user.name || 'Unknown',
        email: user.email || 'N/A',
        phone: user.phone || 'N/A',
        role: user.role || 'user',
        createdAt: user.createdAt || new Date().toISOString(),
        lastLogin: user.lastLogin || null,
        addresses: user.addresses || [],
        addressesCount: (user.addresses || []).length,
        ordersCount: orders.length,
        cartItemsCount: Array.isArray(userCart) ? userCart.length : 0,
        wishlistItemsCount: Array.isArray(userWishlist) ? userWishlist.length : 0,
        returnsCount: returns.length,
        biometricCredentials: user.biometricCredentials || []
      },
      deletedAt: new Date().toISOString(),
      deletedBy: deletedBy, // 'self' or 'admin'
      deletionReason: deletedBy === 'admin' ? 'admin_deleted' : 'self_deleted',
      notes: reason
    };

    deletedUsers.push(deletedUser);
    saveDeletedUsers(deletedUsers);
    return deletedUser;
  } catch (error) {
    console.error('Error archiving user:', error);
    return null;
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

    console.log(`[AI-Enhanced] User updated: ${req.params.id}, Fields: ${Object.keys(updates).join(', ')}`);

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

    // Hash new password with optimized cost factor for VPS
    const hashedPassword = await bcrypt.hash(newPassword, 10);
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
router.delete('/:id', authenticate, isAdmin, async (req, res) => {
  try {
    // Get user first to access data for archive and avatar path
    const user = db.users.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    // Prevent admin from deleting other admins? (Optional but safer)
    if (user.role === 'admin' && user.id !== req.user.id) {
       // Only super-admin or similar could do this, but for now let's just allow it if intended
    }
    
    // Archive user before deletion
    archiveDeletedUser(user, 'admin', 'Account deleted by administrator');

    // Add To Admin Notification Panel
    addNotification({
      type: 'account_deletion',
      title: 'Account Deleted (Admin)',
      message: `User ${user.name || user.email} was deleted by an administrator.`,
      priority: 'medium',
      link: '#users',
      data: { userId: user.id, email: user.email }
    });

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

    // Delete user cart
    const carts = db.carts.findAll();
    if (carts[req.params.id]) {
        delete carts[req.params.id];
        db.carts.replaceAll(carts);
    }

    // Delete user wishlist
    if (db.wishlists) {
        const wishlists = db.wishlists.findAll();
        if (wishlists[req.params.id]) {
            delete wishlists[req.params.id];
            db.wishlists.replaceAll(wishlists);
        }
    }

    res.json({ success: true, message: 'User deleted and archived successfully' });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ success: false, error: 'Failed to delete user' });
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

// ==========================================
// ADMIN PASSWORD RESET MANAGEMENT
// ==========================================

// Get all pending password reset requests (admin only)
router.get('/password-resets/pending', authenticate, isAdmin, (req, res) => {
  try {
    const resets = db.passwordResets.findAll();
    const pendingResets = resets
      .filter(r => !r.used && new Date(r.expiresAt) > new Date())
      .map(r => {
        const user = db.users.findOne({ email: r.email });
        return {
          id: r.id,
          userId: r.userId,
          email: r.email,
          userName: user?.name || 'Unknown',
          otp: r.otp,
          expiresAt: r.expiresAt,
          createdAt: r.createdAt,
          remainingMinutes: Math.max(0, Math.floor((new Date(r.expiresAt) - new Date()) / 60000))
        };
      });
    
    res.json({ success: true, resets: pendingResets });
  } catch (error) {
    console.error('Get pending resets error:', error);
    res.status(500).json({ success: false, error: 'Failed to get pending resets' });
  }
});

// Get password reset history for a user (admin only)
router.get('/password-resets/history/:userId', authenticate, isAdmin, (req, res) => {
  try {
    const user = db.users.findById(req.params.userId);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const resets = db.passwordResets.findAll();
    const userResets = resets
      .filter(r => r.userId === req.params.userId || r.email === user.email)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 20) // Last 20 requests
      .map(r => ({
        id: r.id,
        otp: r.used ? '******' : r.otp,
        expiresAt: r.expiresAt,
        createdAt: r.createdAt,
        used: r.used,
        expired: new Date(r.expiresAt) < new Date(),
        initiatedBy: r.initiatedByAdmin ? 'Admin' : 'User'
      }));
    
    res.json({ 
      success: true, 
      user: { id: user.id, name: user.name, email: user.email },
      history: userResets 
    });
  } catch (error) {
    console.error('Get reset history error:', error);
    res.status(500).json({ success: false, error: 'Failed to get reset history' });
  }
});

// Admin generates password reset OTP for a user (30 minutes validity)
router.post('/password-resets/generate', authenticate, isAdmin, async (req, res) => {
  try {
    const { userId, sendEmail = true } = req.body;

    if (!userId) {
      return res.status(400).json({ success: false, error: 'User ID is required' });
    }

    const user = db.users.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    // Invalidate any existing unused OTPs for this user
    const existingResets = db.passwordResets.findAll();
    existingResets.forEach(r => {
      if ((r.userId === userId || r.email === user.email) && !r.used) {
        db.passwordResets.update(r.id, { used: true, invalidatedAt: new Date().toISOString() });
      }
    });

    // Generate 6-digit OTP
    const otp = crypto.randomInt(100000, 1000000).toString();
    const resetToken = uuidv4();
    
    const resetRequest = {
      id: 'reset_' + uuidv4(),
      userId: user.id,
      email: user.email.toLowerCase(),
      token: resetToken,
      otp: otp,
      expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(), // 30 minutes
      used: false,
      initiatedByAdmin: true,
      adminId: req.user.id,
      createdAt: new Date().toISOString()
    };

    db.passwordResets.create(resetRequest);

    // Add To Admin Notification Panel
    addNotification({
      type: 'password_reset',
      title: 'Password Reset Initiated',
      message: `Admin initiated password reset for ${user.email}`,
      priority: 'medium',
      link: '#password-resets',
      data: { userId: user.id, email: user.email }
    });

    // Optionally send email
    let emailSent = false;
    if (sendEmail) {
      try {
        await sendPasswordResetOTP(user.email, otp);
        emailSent = true;
      } catch (emailError) {
        console.error('Failed to send OTP email:', emailError);
      }
    }

    console.log(`[Admin] Password reset OTP generated for ${user.email} by admin ${req.user.email}: ${otp}`);

    res.json({ 
      success: true, 
      message: `Password reset OTP generated for ${user.name}`,
      otp: otp,
      token: resetToken,
      expiresAt: resetRequest.expiresAt,
      expiresInMinutes: 20,
      emailSent,
      user: {
        id: user.id,
        name: user.name,
        email: user.email
      }
    });
  } catch (error) {
    console.error('Admin generate OTP error:', error);
    res.status(500).json({ success: false, error: 'Failed to generate OTP' });
  }
});

// Admin directly resets user password (without OTP)
router.post('/password-resets/direct-reset', authenticate, isAdmin, async (req, res) => {
  try {
    const { userId, newPassword } = req.body;

    if (!userId || !newPassword) {
      return res.status(400).json({ success: false, error: 'User ID and new password are required' });
    }

    // Validate password strength
    if (newPassword.length < 8) {
      return res.status(400).json({ success: false, error: 'Password must be at least 8 characters' });
    }

    const user = db.users.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    // Hash new password with optimized cost factor
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    
    db.users.update(userId, {
      password: hashedPassword,
      passwordChangedAt: new Date().toISOString(),
      passwordResetByAdmin: true,
      lastPasswordResetBy: req.user.id
    });

    // Invalidate all existing sessions for this user (force re-login)
    const sessions = db.sessions.findAll();
    const userSessions = sessions.filter(s => s.userId === userId);
    userSessions.forEach(s => {
      db.sessions.delete(s.id);
    });

    console.log(`[Admin] Password directly reset for ${user.email} by admin ${req.user.email}`);

    res.json({ 
      success: true, 
      message: `Password reset successfully for ${user.name}. User will need to login with the new password.`,
      user: {
        id: user.id,
        name: user.name,
        email: user.email
      }
    });
  } catch (error) {
    console.error('Admin direct reset error:', error);
    res.status(500).json({ success: false, error: 'Failed to reset password' });
  }
});

// Invalidate/cancel a pending OTP (admin only)
router.delete('/password-resets/:resetId', authenticate, isAdmin, (req, res) => {
  try {
    const reset = db.passwordResets.findById(req.params.resetId);
    if (!reset) {
      return res.status(404).json({ success: false, error: 'Reset request not found' });
    }

    db.passwordResets.update(req.params.resetId, { 
      used: true, 
      invalidatedAt: new Date().toISOString(),
      invalidatedBy: req.user.id
    });

    res.json({ success: true, message: 'Reset OTP invalidated successfully' });
  } catch (error) {
    console.error('Invalidate OTP error:', error);
    res.status(500).json({ success: false, error: 'Failed to invalidate OTP' });
  }
});

// Get all users with password reset capability summary (admin only)
router.get('/password-resets/users-summary', authenticate, isAdmin, (req, res) => {
  try {
    const users = db.users.findAll();
    const resets = db.passwordResets.findAll();

    const usersSummary = users.map(user => {
      const userResets = resets.filter(r => r.userId === user.id || r.email === user.email);
      const pendingReset = userResets.find(r => !r.used && new Date(r.expiresAt) > new Date());
      const lastReset = userResets
        .filter(r => r.used)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];

      return {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone || '',
        role: user.role,
        createdAt: user.createdAt,
        lastLogin: user.lastLogin,
        hasPendingReset: !!pendingReset,
        pendingOtp: pendingReset ? pendingReset.otp : null,
        pendingExpiresAt: pendingReset ? pendingReset.expiresAt : null,
        lastResetDate: lastReset ? lastReset.createdAt : null,
        totalResets: userResets.length
      };
    });

    res.json({ success: true, users: usersSummary });
  } catch (error) {
    console.error('Get users summary error:', error);
    res.status(500).json({ success: false, error: 'Failed to get users summary' });
  }
});

// ==========================================
// BIOMETRIC AUTHENTICATION MANAGEMENT
// ==========================================

// Get user biometric credentials (for user)
router.get('/:id/biometric', authenticate, (req, res) => {
  try {
    if (req.user.role !== 'admin' && req.user.id !== req.params.id) {
      return res.status(403).json({ success: false, error: 'Not authorized' });
    }

    const user = db.users.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    res.json({ 
      success: true, 
      biometricEnabled: user.biometricEnabled || false,
      credentials: (user.biometricCredentials || []).map(c => ({
        id: c.id,
        name: c.name || 'Biometric Device',
        type: c.type || 'unknown',
        createdAt: c.createdAt,
        lastUsed: c.lastUsed
      })),
      maxCredentials: 3
    });
  } catch (error) {
    console.error('Get biometric error:', error);
    res.status(500).json({ success: false, error: 'Failed to get biometric data' });
  }
});

// Register new biometric credential (max 3 per user)
router.post('/:id/biometric', authenticate, (req, res) => {
  try {
    if (req.user.id !== req.params.id) {
      return res.status(403).json({ success: false, error: 'Not authorized' });
    }

    const user = db.users.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const credentials = user.biometricCredentials || [];
    
    // Check max limit (3 credentials per user)
    if (credentials.length >= 3) {
      return res.status(400).json({ 
        success: false, 
        error: 'Maximum 3 biometric credentials allowed. Please delete an existing credential first.' 
      });
    }

    const { credentialId, publicKey, type, name } = req.body;

    if (!credentialId) {
      return res.status(400).json({ success: false, error: 'Credential ID is required' });
    }

    // Check if credential already exists
    if (credentials.some(c => c.id === credentialId)) {
      return res.status(400).json({ success: false, error: 'Credential already registered' });
    }

    const newCredential = {
      id: credentialId,
      publicKey: publicKey || null,
      type: type || 'platform',
      name: name || `Device ${credentials.length + 1}`,
      createdAt: new Date().toISOString(),
      lastUsed: null,
      requiresReauth: false
    };

    credentials.push(newCredential);

    db.users.update(req.params.id, { 
      biometricCredentials: credentials,
      biometricEnabled: true
    });

    res.status(201).json({ 
      success: true, 
      message: 'Biometric credential registered successfully',
      credential: {
        id: newCredential.id,
        name: newCredential.name,
        type: newCredential.type,
        createdAt: newCredential.createdAt
      },
      totalCredentials: credentials.length
    });
  } catch (error) {
    console.error('Register biometric error:', error);
    res.status(500).json({ success: false, error: 'Failed to register biometric' });
  }
});

// Update biometric credential name
router.put('/:id/biometric/:credentialId', authenticate, (req, res) => {
  try {
    if (req.user.id !== req.params.id) {
      return res.status(403).json({ success: false, error: 'Not authorized' });
    }

    const user = db.users.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const credentials = user.biometricCredentials || [];
    const credIndex = credentials.findIndex(c => c.id === req.params.credentialId);

    if (credIndex === -1) {
      return res.status(404).json({ success: false, error: 'Credential not found' });
    }

    const { name } = req.body;
    if (name) {
      credentials[credIndex].name = name;
      credentials[credIndex].updatedAt = new Date().toISOString();
    }

    db.users.update(req.params.id, { biometricCredentials: credentials });

    res.json({ 
      success: true, 
      message: 'Credential updated successfully',
      credential: credentials[credIndex]
    });
  } catch (error) {
    console.error('Update biometric error:', error);
    res.status(500).json({ success: false, error: 'Failed to update biometric' });
  }
});

// Toggle biometric enabled/disabled
router.put('/:id/biometric', authenticate, (req, res) => {
  try {
    if (req.user.id !== req.params.id) {
      return res.status(403).json({ success: false, error: 'Not authorized' });
    }

    const user = db.users.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const { biometricEnabled } = req.body;
    
    if (typeof biometricEnabled !== 'boolean') {
      return res.status(400).json({ success: false, error: 'Invalid biometricEnabled value' });
    }

    // If disabling and no credentials exist, just update the flag
    // If enabling but no credentials exist, still allow (user can add later)
    db.users.update(req.params.id, { biometricEnabled });

    res.json({ 
      success: true, 
      message: `Biometric login ${biometricEnabled ? 'enabled' : 'disabled'}`,
      biometricEnabled
    });
  } catch (error) {
    console.error('Toggle biometric error:', error);
    res.status(500).json({ success: false, error: 'Failed to update biometric setting' });
  }
});

// IMPORTANT: Specific biometric routes must come BEFORE /:credentialId dynamic route

// Admin: Reset user biometric (requires re-authentication)
router.post('/:id/biometric/reset', authenticate, isAdmin, (req, res) => {
  try {
    const user = db.users.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    // Mark all credentials as requiring re-authentication
    const credentials = (user.biometricCredentials || []).map(c => ({
      ...c,
      requiresReauth: true,
      resetAt: new Date().toISOString(),
      resetBy: req.user.id
    }));

    db.users.update(req.params.id, { 
      biometricCredentials: credentials,
      biometricResetRequired: true,
      biometricResetAt: new Date().toISOString()
    });

    console.log(`[Admin] Biometric reset for user ${user.email} by admin ${req.user.email}`);

    res.json({ 
      success: true, 
      message: `Biometric reset initiated for ${user.name}. User will need to re-authenticate.`,
      user: { id: user.id, name: user.name, email: user.email }
    });
  } catch (error) {
    console.error('Admin biometric reset error:', error);
    res.status(500).json({ success: false, error: 'Failed to reset biometric' });
  }
});

// Admin: Clear all user biometric credentials
router.delete('/:id/biometric/all', authenticate, isAdmin, (req, res) => {
  try {
    const user = db.users.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const credentialCount = (user.biometricCredentials || []).length;

    db.users.update(req.params.id, { 
      biometricCredentials: [],
      biometricEnabled: false,
      biometricResetRequired: false,
      // Also notify user that credentials were cleared by admin
      biometricResetByAdmin: true,
      biometricResetByAdminAt: new Date().toISOString(),
      biometricResetByAdminUser: req.user.email || req.user.id
    });

    console.log(`[Admin] All biometric credentials cleared for user ${user.email} by admin ${req.user.email}`);

    res.json({ 
      success: true, 
      message: `${credentialCount} biometric credential(s) removed for ${user.name}`,
      user: { id: user.id, name: user.name, email: user.email }
    });
  } catch (error) {
    console.error('Admin clear biometric error:', error);
    res.status(500).json({ success: false, error: 'Failed to clear biometric' });
  }
});

// Admin: Delete user from biometric system permanently
router.delete('/:id/biometric/delete', authenticate, isAdmin, (req, res) => {
  try {
    const user = db.users.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    // Clear all biometric data completely and set admin reset flag
    db.users.update(req.params.id, { 
      biometricCredentials: [],
      biometricEnabled: false,
      biometricResetRequired: false,
      biometricPublicKey: null,
      biometricChallenge: null,
      biometricResetAt: null,
      biometricRegisteredAt: null,
      lastBiometricLogin: null,
      // Set flag to notify user on next login
      biometricResetByAdmin: true,
      biometricResetByAdminAt: new Date().toISOString(),
      biometricResetByAdminUser: req.user.email || req.user.id
    });

    console.log(`[Admin] User ${user.email} permanently removed from biometric system by admin ${req.user.email}`);

    res.json({ 
      success: true, 
      message: `User ${user.name} permanently removed from biometric authentication`,
      user: { id: user.id, name: user.name, email: user.email }
    });
  } catch (error) {
    console.error('Admin delete biometric user error:', error);
    res.status(500).json({ success: false, error: 'Failed to delete biometric user' });
  }
});

// Delete biometric credential (dynamic route - must come AFTER specific routes)
router.delete('/:id/biometric/:credentialId', authenticate, (req, res) => {
  try {
    if (req.user.role !== 'admin' && req.user.id !== req.params.id) {
      return res.status(403).json({ success: false, error: 'Not authorized' });
    }

    const user = db.users.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const credentials = user.biometricCredentials || [];
    const credIndex = credentials.findIndex(c => c.id === req.params.credentialId);

    if (credIndex === -1) {
      return res.status(404).json({ success: false, error: 'Credential not found' });
    }

    const deleted = credentials.splice(credIndex, 1)[0];

    db.users.update(req.params.id, { 
      biometricCredentials: credentials,
      biometricEnabled: credentials.length > 0
    });

    res.json({ 
      success: true, 
      message: 'Biometric credential deleted successfully',
      deletedCredential: { id: deleted.id, name: deleted.name }
    });
  } catch (error) {
    console.error('Delete biometric error:', error);
    res.status(500).json({ success: false, error: 'Failed to delete biometric' });
  }
});

// Get all users biometric summary (admin only)
router.get('/biometric/summary', authenticate, isAdmin, (req, res) => {
  try {
    const users = db.users.findAll();
    
    const summary = users.map(user => ({
      id: user.id,
      name: user.name,
      email: user.email,
      biometricEnabled: user.biometricEnabled || false,
      credentialCount: (user.biometricCredentials || []).length,
      credentials: (user.biometricCredentials || []).map(c => ({
        id: c.id,
        name: c.name,
        type: c.type,
        createdAt: c.createdAt,
        lastUsed: c.lastUsed,
        requiresReauth: c.requiresReauth || false
      })),
      biometricResetRequired: user.biometricResetRequired || false,
      lastResetAt: user.biometricResetAt || null
    }));

    // Calculate stats
    const usersWithBiometric = summary.filter(u => u.biometricEnabled);
    const totalCredentials = summary.reduce((sum, u) => sum + u.credentialCount, 0);
    const today = new Date().toDateString();
    
    // Count logins today (from credentials with lastUsed today)
    let loginsToday = 0;
    summary.forEach(u => {
      u.credentials.forEach(c => {
        if (c.lastUsed && new Date(c.lastUsed).toDateString() === today) {
          loginsToday++;
        }
      });
    });

    const stats = {
      totalEnabled: usersWithBiometric.length,
      totalCredentials: totalCredentials,
      usersRequiringReauth: summary.filter(u => u.biometricResetRequired).length,
      loginsToday: loginsToday,
      avgLoginTime: 0.8, // Simulated - would need actual tracking
      successRate: 98.5 // Simulated - would need actual tracking
    };

    res.json({ 
      success: true, 
      users: summary.filter(u => u.biometricEnabled || u.credentialCount > 0), 
      totalEnabled: stats.totalEnabled,
      loginsToday: stats.loginsToday,
      avgLoginTime: stats.avgLoginTime,
      successRate: stats.successRate,
      stats 
    });
  } catch (error) {
    console.error('Get biometric summary error:', error);
    res.status(500).json({ success: false, error: 'Failed to get biometric summary' });
  }
});

// ==========================================
// DELETED USERS MANAGEMENT
// ==========================================

// Self-delete account (with data preservation for admin)
router.delete('/:id/self-delete', authenticate, async (req, res) => {
  try {
    if (req.user.id !== req.params.id) {
      return res.status(403).json({ success: false, error: 'Not authorized' });
    }

    const user = db.users.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    // Prevent admin from self-deleting
    if (user.role === 'admin') {
      return res.status(403).json({ success: false, error: 'Admin accounts cannot be self-deleted' });
    }

    // Archive user before deletion
    archiveDeletedUser(user, 'self', req.body.reason || 'User requested account deletion');

    // Add To Admin Notification Panel
    addNotification({
      type: 'account_deletion',
      title: 'Account Deleted (Self)',
      message: `User ${user.name || user.email} has deleted their account. Reason: ${req.body.reason || 'No reason provided'}`,
      priority: 'high',
      link: '#users',
      data: { userId: user.id, email: user.email }
    });

    // Delete user avatar if exists
    if (user.avatar) {
      deleteUploadedFile(user.avatar);
    }

    // Remove user from database
    db.users.delete(req.params.id);

    // Delete user cart
    const carts = db.carts.findAll();
    if (carts[user.id]) {
      delete carts[user.id];
      db.carts.replaceAll(carts);
    }

    // Delete user wishlist
    if (db.wishlists) {
      const allWishlists = db.wishlists.findAll();
      if (allWishlists[user.id]) {
        delete allWishlists[user.id];
        db.wishlists.replaceAll(allWishlists);
      }
    }

    // Invalidate all sessions
    const sessions = db.sessions.findAll();
    const filtered = sessions.filter(s => s.userId !== req.params.id);
    db.sessions.replaceAll(filtered);

    console.log(`[User] Account self-deleted: ${user.email}`);

    res.json({ 
      success: true, 
      message: 'Your account has been permanently deleted. Thank you for using BLACKONN.'
    });
  } catch (error) {
    console.error('Self-delete account error:', error);
    res.status(500).json({ success: false, error: 'Failed to delete account' });
  }
});

// Get all deleted users (admin only)
router.get('/deleted/all', authenticate, isAdmin, (req, res) => {
  try {
    const deletedUsers = getDeletedUsers();
    
    res.json({ 
      success: true, 
      deletedUsers: deletedUsers,
      stats: {
        totalDeleted: deletedUsers.length,
        selfDeleted: deletedUsers.filter(u => u.deletionReason === 'self_deleted').length,
        adminDeleted: deletedUsers.filter(u => u.deletionReason === 'admin_deleted').length
      }
    });
  } catch (error) {
    console.error('Get deleted users error:', error);
    res.status(500).json({ success: false, error: 'Failed to get deleted users' });
  }
});

// Get specific deleted user details (admin only)
router.get('/deleted/:deletedId', authenticate, isAdmin, (req, res) => {
  try {
    const deletedUsers = getDeletedUsers();
    const user = deletedUsers.find(u => u.deletedId === req.params.deletedId || u.originalId === req.params.deletedId);
    
    if (!user) {
      return res.status(404).json({ success: false, error: 'Deleted user not found' });
    }

    res.json({ success: true, deletedUser: user });
  } catch (error) {
    console.error('Get deleted user error:', error);
    res.status(500).json({ success: false, error: 'Failed to get deleted user' });
  }
});

// Permanently remove deleted user record (admin only)
router.delete('/deleted/:deletedId', authenticate, isAdmin, (req, res) => {
  try {
    const deletedUsers = getDeletedUsers();
    // Look for both deletedId or originalId
    const index = deletedUsers.findIndex(u => u.deletedId === req.params.deletedId || u.originalId === req.params.deletedId);
    
    if (index === -1) {
      return res.status(404).json({ success: false, error: 'Deleted user not found' });
    }

    const removed = deletedUsers.splice(index, 1)[0];
    saveDeletedUsers(deletedUsers);

    console.log(`[Admin] Deleted user record permanently removed: ${removed.userData?.email || 'N/A'}`);

    res.json({ 
      success: true, 
      message: 'Deleted user record permanently removed',
      user: removed
    });
  } catch (error) {
    console.error('Remove deleted user error:', error);
    res.status(500).json({ success: false, error: 'Failed to remove record' });
  }
});

module.exports = router;
