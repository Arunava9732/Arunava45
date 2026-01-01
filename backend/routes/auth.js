/**
 * Authentication Routes with Security
 */

const express = require('express');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const db = require('../utils/database');
const crypto = require('crypto');
const { authenticate, generateToken, createSession, invalidateAllSessions, clearAuthCookie, JWT_SECRET } = require('../middleware/auth');
const { 
  authLimiter, 
  registrationLimiter, 
  passwordResetLimiter,
  validateRequest,
  validators 
} = require('../middleware/security');
const { sendPasswordResetOTP } = require('../utils/email');

const router = express.Router();

// Admin credentials should be seeded into the users DB via environment variables (see server startup)

// Read admin config from environment to avoid ReferenceError when checking admin identity
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || null;
const ADMIN_NAME = process.env.ADMIN_NAME || 'Admin';

// OAuth Configuration from environment
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const FACEBOOK_APP_ID = process.env.FACEBOOK_APP_ID || '';
const FACEBOOK_APP_SECRET = process.env.FACEBOOK_APP_SECRET || '';

// Get OAuth configuration for frontend (only public IDs, no secrets)
router.get('/oauth-config', (req, res) => {
  const googleEnabled = !!(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_ID.length > 10);
  const facebookEnabled = !!(FACEBOOK_APP_ID && FACEBOOK_APP_ID.length > 5);
  
  res.json({
    success: true,
    google: { 
      enabled: googleEnabled, 
      clientId: googleEnabled ? GOOGLE_CLIENT_ID : null 
    },
    facebook: { 
      enabled: facebookEnabled, 
      appId: facebookEnabled ? FACEBOOK_APP_ID : null 
    }
  });
});

// Register - with rate limiting and validation
router.post('/register', 
  registrationLimiter,
  validateRequest({
    name: { required: true, name: true, maxLength: 100 },
    email: { required: true, email: true },
    password: { required: true, password: true, minLength: 8 }
  }),
  async (req, res) => {
  try {
    const { name, email, password, phone } = req.body;

    // Additional validation
    if (phone && !validators.isValidPhone(phone)) {
      return res.status(400).json({ success: false, error: 'Invalid phone number format' });
    }

    // Check if user exists
    const existing = db.users.findOne({ email: email.toLowerCase() });
    if (existing) {
      return res.status(400).json({ success: false, error: 'You already have an account with this email. Please login instead.' });
    }

    // Hash password with higher cost factor for security
    const hashedPassword = await bcrypt.hash(password, 12);

    // Create user
    const user = {
      id: 'user_' + uuidv4(),
      name: name.trim(),
      email: email.toLowerCase().trim(),
      phone: phone || '',
      password: hashedPassword,
      role: 'customer',
      createdAt: new Date().toISOString(),
      lastLogin: null,
      failedAttempts: 0,
      lockedUntil: null
    };

    db.users.create(user);

    // Generate token and create session with httpOnly cookie
    const token = generateToken(user);
    createSession(user, token, req, res);

    // Remove password from response
    const { password: _, ...userWithoutPassword } = user;

    res.status(201).json({
      success: true,
      user: userWithoutPassword,
      message: 'Registration successful'
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ success: false, error: 'Registration failed' });
  }
});

// Login - with rate limiting
router.post('/login', authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'Email and password are required' });
    }

    // Validate email format
    if (!validators.isValidEmail(email)) {
      return res.status(400).json({ success: false, error: 'Invalid email format' });
    }

    // No hardcoded admin check here — admin users are regular users with role='admin'

    // Find user
    const user = db.users.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(401).json({ success: false, error: 'Account not found' });
    }

    // Check if locked
    if (user.lockedUntil && new Date(user.lockedUntil) > new Date()) {
      const remainingTime = Math.ceil((new Date(user.lockedUntil) - new Date()) / 1000 / 60);
      return res.status(423).json({ success: false, error: `Account locked for ${remainingTime} minutes` });
    }

    // Verify password
    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      // Increment failed attempts
      const failedAttempts = (user.failedAttempts || 0) + 1;
      const updates = { failedAttempts };

      if (failedAttempts >= 5) {
        updates.lockedUntil = new Date(Date.now() + 15 * 60 * 1000).toISOString();
        updates.failedAttempts = 0;
      }

      db.users.update(user.id, updates);

      const attemptsLeft = 5 - failedAttempts;
      return res.status(401).json({ 
        success: false, 
        error: attemptsLeft > 0 ? `Invalid password. ${attemptsLeft} attempts remaining.` : 'Account locked for 15 minutes'
      });
    }

    // Successful login
    db.users.update(user.id, {
      failedAttempts: 0,
      lockedUntil: null,
      lastLogin: new Date().toISOString()
    });

    // Generate token and session with httpOnly cookie
    const token = generateToken(user);
    createSession(user, token, req, res);

    const { password: _, ...userWithoutPassword } = user;

    res.json({
      success: true,
      user: userWithoutPassword,
      role: user.role || 'customer',
      message: 'Login successful'
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, error: 'Login failed' });
  }
});

// Logout
router.post('/logout', authenticate, (req, res) => {
  try {
    // Delete session
    const sessions = db.sessions.findAll();
    const filtered = sessions.filter(s => s.token !== req.token);
    db.sessions.replaceAll(filtered);

    // Clear httpOnly cookie
    clearAuthCookie(res);

    res.json({ success: true, message: 'Logged out successfully' });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ success: false, error: 'Logout failed' });
  }
});

// Get current user
router.get('/me', authenticate, (req, res) => {
  try {
    if (req.user.id === 'admin') {
      return res.json({
        success: true,
        user: {
          id: 'admin',
          email: ADMIN_EMAIL,
          name: 'Admin',
          role: 'admin'
        }
      });
    }

    const user = db.users.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const { password: _, ...userWithoutPassword } = user;
    res.json({ success: true, user: userWithoutPassword });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ success: false, error: 'Failed to get user' });
  }
});

// Request password reset - with rate limiting
router.post('/forgot-password', passwordResetLimiter, async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ success: false, error: 'Email is required' });
    }

    // Validate email format
    if (!validators.isValidEmail(email)) {
      return res.status(400).json({ success: false, error: 'Invalid email format' });
    }

    const user = db.users.findOne({ email: email.toLowerCase() });
    
    // Validate user account exists
    if (!user) {
      return res.status(404).json({ success: false, error: 'No account found with this email address. Please sign up first.' });
    }

    // Generate 6-digit OTP using crypto for better randomness
    const otp = crypto.randomInt(100000, 1000000).toString();
    const resetToken = uuidv4();
    
    const resetRequest = {
      id: 'reset_' + uuidv4(),
      userId: user.id,
      email: email.toLowerCase(),
      token: resetToken,
      otp: otp,
      expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(), // 30 minutes
      used: false,
      createdAt: new Date().toISOString()
    };

    db.passwordResets.create(resetRequest);

    // Send email with OTP
    await sendPasswordResetOTP(email.toLowerCase(), otp);

    if (process.env.NODE_ENV !== 'production') {
      console.log(`Password reset OTP for ${email}: ${otp}`);
      console.log(`Password reset token for ${email}: ${resetToken}`);
    }

    res.json({ 
      success: true, 
      message: 'Reset OTP generated and sent to your email',
      token: resetToken,
      // Only return OTP in development for testing
      otp: process.env.NODE_ENV === 'production' ? undefined : otp
    });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ success: false, error: 'Failed to process request' });
  }
});

// Verify OTP before password reset
router.post('/verify-otp', (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({ success: false, error: 'Email and OTP are required' });
    }

    // Find valid reset request with matching OTP
    const resetRequest = db.passwordResets.findOne({ 
      email: email.toLowerCase(),
      otp: otp,
      used: false 
    });

    if (!resetRequest) {
      return res.status(400).json({ success: false, error: 'Invalid OTP. Please check and try again.' });
    }

    if (new Date(resetRequest.expiresAt) < new Date()) {
      return res.status(400).json({ success: false, error: 'OTP has expired. Please request a new one.' });
    }

    res.json({ 
      success: true, 
      message: 'OTP verified successfully',
      token: resetRequest.token
    });
  } catch (error) {
    console.error('Verify OTP error:', error);
    res.status(500).json({ success: false, error: 'Failed to verify OTP' });
  }
});

// Reset password with token
router.post('/reset-password', async (req, res) => {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      return res.status(400).json({ success: false, error: 'Token and new password are required' });
    }

    // Find valid reset request
    const resetRequest = db.passwordResets.findOne({ 
      token, 
      used: false 
    });

    if (!resetRequest) {
      return res.status(400).json({ success: false, error: 'Invalid or expired reset token' });
    }

    if (new Date(resetRequest.expiresAt) < new Date()) {
      return res.status(400).json({ success: false, error: 'Reset token has expired' });
    }

    // Find user and update password
    const user = db.users.findOne({ email: resetRequest.email });
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    db.users.update(user.id, { 
      password: hashedPassword,
      passwordChangedAt: new Date().toISOString()
    });

    // Mark reset token as used
    db.passwordResets.update(resetRequest.id, { 
      used: true, 
      usedAt: new Date().toISOString() 
    });

    res.json({ success: true, message: 'Password updated successfully' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ success: false, error: 'Failed to reset password' });
  }
});

// Verify token
router.get('/verify', authenticate, (req, res) => {
  res.json({ success: true, valid: true, user: req.user });
});

// ============ OAUTH ROUTES ============

// Google OAuth - Login/Signup with ID Token
router.post('/google', async (req, res) => {
  try {
    const { idToken } = req.body;
    
    if (!idToken) {
      return res.status(400).json({ success: false, error: 'ID token is required' });
    }

    // Verify Google ID token via Google's tokeninfo endpoint
    let payload;
    let email, name, picture, googleId;
    try {
      const fetch = (await import('node-fetch')).default;
      const tokenInfoRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`);
      if (!tokenInfoRes.ok) {
        return res.status(400).json({ success: false, error: 'Invalid Google ID token' });
      }
      payload = await tokenInfoRes.json();

      // Optional: verify audience matches configured client id
      if (GOOGLE_CLIENT_ID && payload.aud && payload.aud !== GOOGLE_CLIENT_ID) {
        return res.status(400).json({ success: false, error: 'Token audience mismatch' });
      }

      ({ email, name, picture, sub: googleId } = payload);
    } catch (e) {
      console.error('Google token verification error:', e);
      return res.status(400).json({ success: false, error: 'Invalid token' });
    }

    if (!email) {
      return res.status(400).json({ success: false, error: 'Email not provided by Google' });
    }

    // Check if user exists with this email
    let user = db.users.findOne({ email: email.toLowerCase() });

    if (user) {
      // User exists - update Google ID if not set and log them in
      if (!user.googleId) {
        db.users.update(user.id, { 
          googleId,
          avatar: user.avatar || picture,
          lastLogin: new Date().toISOString()
        });
      } else {
        db.users.update(user.id, { lastLogin: new Date().toISOString() });
      }
      user = db.users.findById(user.id); // Refresh user data
    } else {
      // Create new user with Google data
      const newUser = {
        id: 'user_' + uuidv4(),
        email: email.toLowerCase(),
        name: name || email.split('@')[0],
        googleId,
        avatar: picture || null,
        phone: '',
        password: null, // No password for OAuth users
        role: 'customer',
        authProvider: 'google',
        createdAt: new Date().toISOString(),
        lastLogin: new Date().toISOString()
      };
      db.users.create(newUser);
      user = newUser;
    }

    // Generate JWT token
    const token = generateToken(user);
    
    // Create session with httpOnly cookie
    createSession(user, token, req, res);

    const { password: _, ...userWithoutPassword } = user;

    res.json({
      success: true,
      user: userWithoutPassword,
      role: user.role || 'customer',
      isNewUser: !user.googleId
    });
  } catch (error) {
    console.error('Google auth error:', error);
    res.status(500).json({ success: false, error: 'Google authentication failed' });
  }
});

// Google OAuth - Login/Signup with authorization code
router.post('/google/code', async (req, res) => {
  try {
    const { code } = req.body;
    
    if (!code) {
      return res.status(400).json({ success: false, error: 'Authorization code is required' });
    }

    // In production, you would exchange the code for tokens using Google's OAuth2 API
    // For now, return an error indicating this needs to be configured
    return res.status(501).json({ 
      success: false, 
      error: 'Google OAuth code exchange not configured. Please use the ID token method or configure GOOGLE_CLIENT_SECRET on the server.' 
    });
  } catch (error) {
    console.error('Google code auth error:', error);
    res.status(500).json({ success: false, error: 'Google authentication failed' });
  }
});

// Google OAuth - Login/Signup with access token (popup flow fallback)
router.post('/google/token', async (req, res) => {
  try {
    const { accessToken, userInfo } = req.body;
    
    if (!accessToken) {
      return res.status(400).json({ success: false, error: 'Access token is required' });
    }

    let email, name, picture, googleId;
    
    // If userInfo is provided, use it (already fetched by frontend)
    if (userInfo && userInfo.email) {
      email = userInfo.email;
      name = userInfo.name;
      picture = userInfo.picture;
      googleId = userInfo.sub;
    } else {
      // Verify access token by fetching user info from Google
      try {
        const fetch = (await import('node-fetch')).default;
        const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
          headers: { Authorization: `Bearer ${accessToken}` }
        });
        
        if (!userInfoRes.ok) {
          return res.status(401).json({ success: false, error: 'Invalid Google access token' });
        }
        
        const userData = await userInfoRes.json();
        email = userData.email;
        name = userData.name;
        picture = userData.picture;
        googleId = userData.sub;
      } catch (e) {
        console.error('Google token verification error:', e);
        return res.status(400).json({ success: false, error: 'Failed to verify Google token' });
      }
    }

    if (!email) {
      return res.status(400).json({ success: false, error: 'Email not provided by Google' });
    }

    // Check if user exists with this email
    let user = db.users.findOne({ email: email.toLowerCase() });

    if (user) {
      // User exists - update Google ID if not set and log them in
      if (!user.googleId) {
        db.users.update(user.id, { 
          googleId,
          avatar: user.avatar || picture,
          lastLogin: new Date().toISOString()
        });
      } else {
        db.users.update(user.id, { lastLogin: new Date().toISOString() });
      }
      user = db.users.findById(user.id); // Refresh user data
    } else {
      // Create new user with Google data
      const newUser = {
        id: 'user_' + uuidv4(),
        email: email.toLowerCase(),
        name: name || email.split('@')[0],
        googleId,
        avatar: picture || null,
        phone: '',
        password: null, // No password for OAuth users
        role: 'customer',
        authProvider: 'google',
        createdAt: new Date().toISOString(),
        lastLogin: new Date().toISOString()
      };
      db.users.create(newUser);
      user = newUser;
    }

    // Generate JWT token
    const token = generateToken(user);
    
    // Create session with httpOnly cookie
    createSession(user, token, req, res);

    const { password: _, ...userWithoutPassword } = user;

    res.json({
      success: true,
      user: userWithoutPassword,
      role: user.role || 'customer',
      isNewUser: !user.googleId
    });
  } catch (error) {
    console.error('Google token auth error:', error);
    res.status(500).json({ success: false, error: 'Google authentication failed' });
  }
});

// Facebook OAuth - Login/Signup with access token
router.post('/facebook', async (req, res) => {
  try {
    const { accessToken } = req.body;
    
    if (!accessToken) {
      return res.status(400).json({ success: false, error: 'Access token is required' });
    }

    // Fetch user data from Facebook Graph API
    const fetch = (await import('node-fetch')).default;
    const fbResponse = await fetch(
      `https://graph.facebook.com/me?fields=id,name,email,picture.type(large)&access_token=${accessToken}`
    );

    if (!fbResponse.ok) {
      return res.status(401).json({ success: false, error: 'Invalid Facebook access token' });
    }

    const fbData = await fbResponse.json();
    const { id: facebookId, name, email, picture } = fbData;

    if (!email) {
      return res.status(400).json({ 
        success: false, 
        error: 'Email permission not granted. Please allow email access in Facebook.' 
      });
    }

    const avatarUrl = picture?.data?.url || null;

    // Check if user exists with this email
    let user = db.users.findOne({ email: email.toLowerCase() });

    if (user) {
      // User exists - update Facebook ID if not set and log them in
      if (!user.facebookId) {
        db.users.update(user.id, { 
          facebookId,
          avatar: user.avatar || avatarUrl,
          lastLogin: new Date().toISOString()
        });
      } else {
        db.users.update(user.id, { lastLogin: new Date().toISOString() });
      }
      user = db.users.findById(user.id); // Refresh user data
    } else {
      // Create new user with Facebook data
      const newUser = {
        id: 'user_' + uuidv4(),
        email: email.toLowerCase(),
        name: name || email.split('@')[0],
        facebookId,
        avatar: avatarUrl,
        phone: '',
        password: null, // No password for OAuth users
        role: 'customer',
        authProvider: 'facebook',
        createdAt: new Date().toISOString(),
        lastLogin: new Date().toISOString()
      };
      db.users.create(newUser);
      user = newUser;
    }

    // Generate JWT token
    const token = generateToken(user);
    
    // Create session with httpOnly cookie
    createSession(user, token, req, res);

    const { password: _, ...userWithoutPassword } = user;

    res.json({
      success: true,
      user: userWithoutPassword,
      role: user.role || 'customer',
      isNewUser: !user.facebookId
    });
  } catch (error) {
    console.error('Facebook auth error:', error);
    res.status(500).json({ success: false, error: 'Facebook authentication failed' });
  }
});

module.exports = router;
