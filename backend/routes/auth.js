/**
 * Authentication Routes with Security - AI Enhanced
 */

const express = require('express');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const db = require('../utils/database');
const crypto = require('crypto');
const { authenticate, generateToken, createSession, invalidateAllSessions, invalidateSessionCache, clearAuthCookie, JWT_SECRET } = require('../middleware/auth');
const { 
  authLimiter, 
  registrationLimiter, 
  passwordResetLimiter,
  validateRequest,
  validators 
} = require('../middleware/security');
const { aiRequestLogger, aiPerformanceMonitor } = require('../middleware/aiEnhancer');
const { sendPasswordResetOTP } = require('../utils/email');
const { addNotification } = require('../utils/adminNotificationStore');

const router = express.Router();

// Apply AI middleware
router.use(aiRequestLogger);
router.use(aiPerformanceMonitor(1000)); // Auth should be fast

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

    // Hash password with optimized cost factor for better VPS performance
    const hashedPassword = await bcrypt.hash(password, 10);
    console.log(`[Register] Creating user with email: ${email.toLowerCase().trim()}`);

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
    console.log(`[Register] User created with ID: ${user.id}`);

    // Add To Admin Notification Panel
    addNotification({
      type: 'user_registration',
      title: 'New User Registered',
      message: `New account created: ${user.name} (${user.email})`,
      priority: 'low',
      link: '#users',
      data: { userId: user.id, email: user.email }
    });

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

    // Find user - normalize email to lowercase and trim
    const normalizedEmail = email.toLowerCase().trim();
    console.log(`[AUTH-DEBUG] Attempting login for: ${normalizedEmail}`);
    const user = db.users.findOne({ email: normalizedEmail });
    
    if (!user) {
      console.warn(`[AUTH-DEBUG] User not found: ${normalizedEmail}`);
      return res.status(401).json({ success: false, error: 'No account found with this email address. Please sign up first.' });
    }

    console.log(`[AUTH-DEBUG] User found: ${user.email}, Role: ${user.role}`);

    // Check if user has a password (might be OAuth-only user)
    if (!user.password) {
      console.warn(`[AUTH-DEBUG] User has no password (OAuth): ${normalizedEmail}`);
      return res.status(401).json({ success: false, error: 'This account uses social login. Please sign in with Google or Facebook.' });
    }

    // Check if locked
    if (user.permanentlyLocked) {
      console.warn(`[AUTH-DEBUG] Account permanently locked: ${normalizedEmail}`);
      return res.status(423).json({ success: false, error: 'Your account has been permanently locked. Please contact support.' });
    }

    if (user.lockedUntil && new Date(user.lockedUntil) > new Date()) {
      console.warn(`[AUTH-DEBUG] Account locked: ${normalizedEmail}`);
      const remainingTime = Math.ceil((new Date(user.lockedUntil) - new Date()) / 1000 / 60);
      return res.status(423).json({ success: false, error: `Account locked for ${remainingTime} minutes. Please try again later.` });
    }

    // Verify password
    console.log(`[AUTH-DEBUG] Verifying password for: ${normalizedEmail}`);
    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      console.warn(`[AUTH-DEBUG] Invalid password for: ${normalizedEmail}`);
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

    // Performance Optimization: Check if password hash uses high cost factor (12)
    // and upgrade to optimized factor (10) for better VPS performance
    if (user.password.startsWith('$2a$12$')) {
      try {
        console.log(`[AUTH] Upgrading password cost factor for ${normalizedEmail} from 12 to 10 for performance`);
        const upgradedHash = await bcrypt.hash(password, 10);
        db.users.update(user.id, { password: upgradedHash });
      } catch (hashError) {
        console.warn(`[AUTH] Failed to upgrade password hash: ${hashError.message}`);
        // Non-critical, continue login
      }
    }
    
    console.log(`[Login] User ${normalizedEmail} logged in successfully`);

    // Check if biometric was reset by admin - prepare notification
    let biometricResetNotification = null;
    if (user.biometricResetByAdmin) {
      biometricResetNotification = {
        type: 'biometric_reset',
        message: 'Your biometric authentication was reset by an administrator. You will need to re-register your biometric credentials.',
        resetAt: user.biometricResetByAdminAt
      };
      // Clear the flag after showing notification
      db.users.update(user.id, { 
        biometricResetByAdmin: false,
        biometricResetByAdminAt: null,
        biometricResetByAdminUser: null
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

    const { password: _, biometricResetByAdmin: __, biometricResetByAdminAt: ___, biometricResetByAdminUser: ____, ...userWithoutPassword } = user;

    res.json({
      success: true,
      user: userWithoutPassword,
      role: user.role || 'customer',
      message: 'Login successful',
      notification: biometricResetNotification
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, error: 'Login failed' });
  }
});

// Biometric Login - authenticate with biometric credential
router.post('/biometric-login', async (req, res) => {
  try {
    const { email, credentialId, biometricAuth } = req.body;

    if (!email || !biometricAuth) {
      return res.status(400).json({ success: false, error: 'Email and biometric authentication required' });
    }

    // Find user
    const user = db.users.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(401).json({ success: false, error: 'No account found with this email address. Please sign up first.' });
    }

    // Check if biometric was reset by admin
    if (user.biometricResetByAdmin) {
      return res.status(401).json({ 
        success: false, 
        error: 'Your biometric authentication was reset by an administrator. Please login with password to re-register.',
        resetByAdmin: true,
        requiresReauth: true
      });
    }

    // Check if biometric is enabled for user
    if (!user.biometricEnabled) {
      return res.status(401).json({ 
        success: false, 
        error: 'Biometric authentication not enabled for this account' 
      });
    }

    // Check if biometric reset is required
    if (user.biometricResetRequired) {
      return res.status(401).json({ 
        success: false, 
        error: 'Biometric re-authentication required. Please login with password first.',
        requiresReauth: true
      });
    }

    // Verify credential exists for user
    const credentials = user.biometricCredentials || [];
    const matchingCred = credentialId 
      ? credentials.find(c => c.id === credentialId)
      : credentials[0];

    if (!matchingCred) {
      return res.status(401).json({ 
        success: false, 
        error: 'No biometric credential found. Please login with password to register biometric.',
        noCredentials: true,
        requiresPasswordLogin: true
      });
    }

    // Check if credential requires re-authentication
    if (matchingCred.requiresReauth) {
      return res.status(401).json({ 
        success: false, 
        error: 'This biometric credential requires re-authentication. Please login with password first.',
        requiresReauth: true
      });
    }

    // Update last used timestamp
    const updatedCredentials = credentials.map(c => 
      c.id === matchingCred.id ? { ...c, lastUsed: new Date().toISOString() } : c
    );

    // Update user login info
    db.users.update(user.id, {
      biometricCredentials: updatedCredentials,
      lastLogin: new Date().toISOString(),
      lastBiometricLogin: new Date().toISOString()
    });

    // Generate token and session
    const token = generateToken(user);
    createSession(user, token, req, res);

    const { password: _, ...userWithoutPassword } = user;

    console.log(`[Biometric] User ${email} logged in via biometric`);

    res.json({
      success: true,
      user: userWithoutPassword,
      role: user.role || 'customer',
      message: 'Biometric login successful'
    });
  } catch (error) {
    console.error('Biometric login error:', error);
    res.status(500).json({ success: false, error: 'Biometric login failed' });
  }
});

// Clear biometric reset flag after successful password login
router.post('/clear-biometric-reset', authenticate, (req, res) => {
  try {
    const user = db.users.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    // Clear reset flag and re-authenticate all credentials
    const credentials = (user.biometricCredentials || []).map(c => ({
      ...c,
      requiresReauth: false
    }));

    db.users.update(req.user.id, { 
      biometricCredentials: credentials,
      biometricResetRequired: false
    });

    res.json({ 
      success: true, 
      message: 'Biometric reset cleared. You can now use biometric login again.' 
    });
  } catch (error) {
    console.error('Clear biometric reset error:', error);
    res.status(500).json({ success: false, error: 'Failed to clear biometric reset' });
  }
});

// Logout
router.post('/logout', authenticate, (req, res) => {
  try {
    // Invalidate session cache first
    invalidateSessionCache(req.token);
    
    // Delete session
    const sessions = db.sessions.findAll();
    const filtered = sessions.filter(s => s.token !== req.token);
    db.sessions.replaceAll(filtered);

    // Clear httpOnly cookie
    clearAuthCookie(res, req);

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

    // Add To Admin Notification Panel
    addNotification({
      type: 'password_reset_request',
      title: 'Password Reset Requested',
      message: `User ${email} has requested a password reset OTP.`,
      priority: 'medium',
      link: '#password-resets',
      data: { userId: user.id, email: user.email }
    });

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

    // Add To Admin Notification Panel
    addNotification({
      type: 'password_reset_success',
      title: 'Password Reset Successful',
      message: `User ${resetRequest.email} has successfully reset their password.`,
      priority: 'medium',
      link: '#users',
      data: { email: resetRequest.email }
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

// ============ DIAGNOSTIC ENDPOINT ============
// Check service configuration status (admin only or development mode)
router.get('/service-status', async (req, res) => {
  try {
    // Only allow in development or for admin users
    const token = req.cookies.token;
    let isAdmin = false;
    
    if (token) {
      const session = db.sessions.findOne({ token });
      if (session) {
        const user = db.users.findById(session.userId);
        isAdmin = user?.role === 'admin';
      }
    }
    
    // Only show detailed info to admins or in development
    const isDev = process.env.NODE_ENV !== 'production';
    if (!isAdmin && !isDev) {
      return res.status(403).json({ success: false, error: 'Admin access required' });
    }

    const status = {
      success: true,
      timestamp: new Date().toISOString(),
      nodeEnv: process.env.NODE_ENV || 'not set',
      
      // OAuth Status
      oauth: {
        google: {
          enabled: !!(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_ID.length > 10),
          clientIdConfigured: !!GOOGLE_CLIENT_ID && GOOGLE_CLIENT_ID.length > 10,
          clientSecretConfigured: !!GOOGLE_CLIENT_SECRET && GOOGLE_CLIENT_SECRET.length > 5,
          // Show first/last chars to help debug without exposing full key
          clientIdPreview: GOOGLE_CLIENT_ID ? `${GOOGLE_CLIENT_ID.substring(0, 8)}...${GOOGLE_CLIENT_ID.slice(-4)}` : 'not set'
        },
        facebook: {
          enabled: !!(FACEBOOK_APP_ID && FACEBOOK_APP_ID.length > 5),
          appIdConfigured: !!FACEBOOK_APP_ID && FACEBOOK_APP_ID.length > 5,
          appSecretConfigured: !!FACEBOOK_APP_SECRET && FACEBOOK_APP_SECRET.length > 5,
          appIdPreview: FACEBOOK_APP_ID ? `${FACEBOOK_APP_ID.substring(0, 4)}...` : 'not set'
        }
      },
      
      // Email Status
      email: {
        configured: !!(process.env.EMAIL_HOST && process.env.EMAIL_USER && process.env.EMAIL_PASS),
        host: process.env.EMAIL_HOST || 'not set',
        port: process.env.EMAIL_PORT || '587 (default)',
        secure: process.env.EMAIL_SECURE || 'false (default)',
        user: process.env.EMAIL_USER ? `${process.env.EMAIL_USER.substring(0, 3)}...@...` : 'not set',
        fromName: process.env.EMAIL_FROM_NAME || 'BLACKONN (default)',
        fromAddress: process.env.EMAIL_FROM_ADDRESS || process.env.EMAIL_USER || 'not set'
      },
      
      // SMS Status
      sms: {
        enabled: process.env.SMS_ENABLED === 'true',
        provider: process.env.SMS_PROVIDER || 'twilio (default)',
        msg91: {
          authKeyConfigured: !!process.env.MSG91_AUTH_KEY,
          senderId: process.env.MSG91_SENDER_ID || 'BLKONN (default)',
          flowIdConfigured: !!process.env.MSG91_FLOW_ID
        }
      },
      
      // WhatsApp Status
      whatsapp: {
        provider: process.env.WHATSAPP_PROVIDER || 'both (default)',
        meta: {
          configured: !!(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID),
          tokenConfigured: !!process.env.WHATSAPP_TOKEN,
          phoneNumberIdConfigured: !!process.env.WHATSAPP_PHONE_NUMBER_ID
        },
        msg91: {
          configured: !!(process.env.MSG91_AUTH_KEY && process.env.MSG91_WHATSAPP_SENDER),
          authKeyConfigured: !!process.env.MSG91_AUTH_KEY,
          senderConfigured: !!process.env.MSG91_WHATSAPP_SENDER
        }
      },
      
      // Server Info
      server: {
        port: process.env.PORT || 3000,
        jwtSecretConfigured: !!process.env.JWT_SECRET && process.env.JWT_SECRET.length >= 16,
        cookieSecretConfigured: !!process.env.COOKIE_SECRET && process.env.COOKIE_SECRET.length >= 16
      },
      
      // Recommendations
      issues: []
    };

    // Check if any WhatsApp provider is ready
    const metaWhatsAppReady = status.whatsapp.meta.configured;
    const msg91WhatsAppReady = status.whatsapp.msg91.configured;
    status.whatsapp.anyProviderReady = metaWhatsAppReady || msg91WhatsAppReady;

    // Add recommendations based on configuration
    if (!status.oauth.google.enabled) {
      status.issues.push('Google OAuth: Not configured. Set GOOGLE_CLIENT_ID in .env');
    }
    if (status.oauth.google.clientIdConfigured && !status.oauth.google.clientSecretConfigured) {
      status.issues.push('Google OAuth: Client ID set but SECRET is missing');
    }
    if (!status.oauth.facebook.enabled) {
      status.issues.push('Facebook OAuth: Not configured. Set FACEBOOK_APP_ID in .env');
    }
    if (!status.email.configured) {
      status.issues.push('Email: Not configured. Set EMAIL_HOST, EMAIL_USER, EMAIL_PASS in .env');
    }
    if (!status.sms.enabled) {
      status.issues.push('SMS: Disabled. Set SMS_ENABLED=true in .env');
    }
    if (status.sms.provider === 'msg91' && !status.sms.msg91.authKeyConfigured) {
      status.issues.push('SMS (MSG91): AUTH_KEY not set. Set MSG91_AUTH_KEY in .env');
    }
    if (status.sms.provider === 'msg91' && !status.sms.msg91.flowIdConfigured) {
      status.issues.push('SMS (MSG91): FLOW_ID not set. Required for DLT compliance in India');
    }
    
    // WhatsApp issues
    if (!status.whatsapp.anyProviderReady) {
      status.issues.push('WhatsApp: No provider configured. Set Meta (WHATSAPP_TOKEN + WHATSAPP_PHONE_NUMBER_ID) or MSG91 (MSG91_AUTH_KEY + MSG91_WHATSAPP_SENDER)');
    }
    if (!status.server.jwtSecretConfigured) {
      status.issues.push('Security: JWT_SECRET not set or too short (min 16 chars)');
    }
    
    res.json(status);
  } catch (error) {
    console.error('Service status error:', error);
    res.status(500).json({ success: false, error: 'Failed to get service status' });
  }
});

module.exports = router;
