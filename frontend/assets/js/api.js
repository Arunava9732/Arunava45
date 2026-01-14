/**
 * BLACKONN API Client - AI Enhanced
 * Frontend API wrapper with AI-friendly features:
 * - Structured error handling
 * - Performance tracking
 * - Request/response logging
 * - Automatic retry logic
 * Cloud-ready: Uses httpOnly cookies for auth (no localStorage)
 * Compatible with any hosting platform (AWS, Azure, Heroku, etc.)
 */

const API = (() => {
  // Configuration - detect environment
  const isDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  
  // Handle Live Server (port 5500) vs Backend (port 3000)
  let detectedBaseUrl = window.location.origin;
  if (isDev && window.location.port === '5500') {
    detectedBaseUrl = window.location.protocol + '//' + window.location.hostname + ':3000';
  }
  
  const BASE_URL = (isDev ? detectedBaseUrl : (window.API_BASE_URL || window.location.origin)).replace(/\/$/, '');
  const API_URL = `${BASE_URL}/api`;
  
  // Auth state - cached from server (no localStorage)
  let cachedUser = null;
  let authChecked = false;
  let pendingAuthPromise = null;
  
  // API availability status
  let apiAvailable = null;
  let connectionRetries = 0;
  const MAX_RETRIES = 5;
  const HEALTH_CHECK_INTERVAL = 30000; // Re-check health every 30 seconds if down
  
  // AI Performance Tracker
  const performanceTracker = {
    requests: [],
    logRequest(endpoint, duration, status) {
      this.requests.push({
        endpoint,
        duration,
        status,
        timestamp: new Date().toISOString()
      });
      
      // Keep only last 100 requests
      if (this.requests.length > 100) {
        this.requests.shift();
      }
      
      // Log slow requests (excluding expected slow startup probes)
      if (duration > 1500 && endpoint !== '/auth/me' && !endpoint.includes('/settings')) {
        console.warn('[AI-PERFORMANCE] Slow API request', { endpoint, duration, status });
      }
    },
    getStats() {
      if (this.requests.length === 0) return null;
      
      const durations = this.requests.map(r => r.duration);
      return {
        totalRequests: this.requests.length,
        avgDuration: durations.reduce((a, b) => a + b, 0) / durations.length,
        maxDuration: Math.max(...durations),
        minDuration: Math.min(...durations)
      };
    }
  };

  // =====================
  // Helper Functions
  // =====================

  // Get cached user (async - fetches from server if not cached)
  const getCachedUser = async () => {
    if (cachedUser && authChecked) return cachedUser;
    
    // Deduplicate concurrent requests
    if (pendingAuthPromise) return pendingAuthPromise;

    pendingAuthPromise = (async () => {
      try {
        const data = await request('/auth/me');
        if (data.success && data.user) {
          cachedUser = data.user;
          authChecked = true;
          console.log('[AI-AUTH] User authenticated:', cachedUser.email);
          return cachedUser;
        }
      } catch (err) {
        // Silently fail auth check - standard behavior for logged out users
      } finally {
        authChecked = true;
        pendingAuthPromise = null;
      }
      cachedUser = null;
      return null;
    })();

    return pendingAuthPromise;
  };

  // Set cached user
  const setCachedUser = (user) => {
    cachedUser = user;
    authChecked = true;
  };

  // Clear cached user
  const clearCachedUser = () => {
    cachedUser = null;
    authChecked = false;
  };

  // Check if server API is available with retry logic
  const checkApiAvailable = async (forceCheck = false) => {
    if (apiAvailable !== null && !forceCheck) return apiAvailable;
    
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000); // 8 second timeout
      
      const response = await fetch(`${API_URL}/health`, { 
        method: 'GET',
        signal: controller.signal,
        credentials: 'include' // Include cookies
      });
      clearTimeout(timeoutId);
      
      apiAvailable = response.ok;
      connectionRetries = 0;
    } catch (error) {
      connectionRetries++;
      apiAvailable = false;
      
      if (connectionRetries <= MAX_RETRIES) {
        console.warn(`[API] Connection attempt ${connectionRetries}/${MAX_RETRIES} failed, retrying in ${connectionRetries}s...`);
        await new Promise(resolve => setTimeout(resolve, 1000 * connectionRetries));
        return checkApiAvailable(true);
      }
    }
    
    if (!apiAvailable) {
      console.error('[API] Server unavailable after all retries. Will retry periodically.');
      showConnectionError();
      
      // Schedule periodic retry
      setTimeout(() => {
        apiAvailable = null; // Reset to allow fresh check
        checkApiAvailable(true).then(available => {
          if (available) {
            console.log('[API] Server reconnected!');
            hideConnectionError();
            window.location.reload();
          }
        });
      }, HEALTH_CHECK_INTERVAL);
    } else {
      console.log('[API] Server connected successfully');
      hideConnectionError();
    }
    
    return apiAvailable;
  };
  
  // Show connection error UI
  const showConnectionError = () => {
    if (document.getElementById('api-connection-error')) return;
    
    const errorBanner = document.createElement('div');
    errorBanner.id = 'api-connection-error';
    errorBanner.innerHTML = `
      <div style="position: fixed; top: 0; left: 0; right: 0; background: linear-gradient(135deg, #dc2626 0%, #991b1b 100%); color: white; padding: 12px 20px; text-align: center; z-index: 99999; font-family: system-ui, sans-serif; box-shadow: 0 4px 20px rgba(0,0,0,0.3);">
        <strong>⚠️ Connecting to server...</strong> - Please wait while we establish connection. 
        <span id="api-retry-countdown"></span>
        <button onclick="location.reload()" style="margin-left: 15px; padding: 6px 16px; background: white; color: #dc2626; border: none; border-radius: 6px; cursor: pointer; font-weight: 600;">Retry Now</button>
      </div>
    `;
    document.body.prepend(errorBanner);
    
    // Add countdown timer
    let countdown = 30;
    const countdownEl = document.getElementById('api-retry-countdown');
    if (countdownEl) {
      const updateCountdown = () => {
        countdownEl.textContent = `Auto-retry in ${countdown}s`;
        countdown--;
        if (countdown >= 0) setTimeout(updateCountdown, 1000);
      };
      updateCountdown();
    }
  };
  
  // Hide connection error UI
  const hideConnectionError = () => {
    const errorBanner = document.getElementById('api-connection-error');
    if (errorBanner) errorBanner.remove();
  };

  // Build headers (no auth token needed - uses cookies)
  const getHeaders = () => {
    return {
      'Content-Type': 'application/json'
    };
  };

  // API request wrapper - uses httpOnly cookies for auth
  const request = async (endpoint, options = {}) => {
    const isAvailable = await checkApiAvailable();
    
    if (!isAvailable) {
      throw new Error('API_UNAVAILABLE');
    }

    const url = `${API_URL}${endpoint}`;
    const startTime = performance.now();
    
    const config = {
      headers: getHeaders(),
      credentials: 'include', // Include httpOnly cookies
      ...options
    };

    try {
      const response = await fetch(url, config);
      const data = await response.json();
      
      const duration = performance.now() - startTime;
      performanceTracker.logRequest(endpoint, duration, response.status);

      if (!response.ok) {
        // Handle auth errors
        // Silently handle 401s - they are common when sessions expire or if not logged in
        if (response.status === 401) {
          clearCachedUser();
          window.dispatchEvent(new Event('auth:logout'));
          
          if (endpoint === '/auth/me' || endpoint === '/cart' || endpoint === '/wishlist') {
             throw new Error('NOT_AUTHENTICATED');
          }
        }
        
        // Don't log expected 401 or startup 404 errors to keep console clean
        const isStartupError = response.status === 401 || (response.status === 404 && endpoint.includes('/settings/security'));
        
        if (!isStartupError) {
          console.error('[AI-API-ERROR]', JSON.stringify({
            endpoint,
            status: response.status,
            error: data.error,
            aiAnalysis: data._aiAnalysis
          }));
        }
        
        throw new Error(data.error || 'Request failed');
      }

      console.log('[AI-API-SUCCESS]', { endpoint, duration: `${duration.toFixed(0)}ms`, status: response.status });
      return data;
    } catch (error) {
      const duration = performance.now() - startTime;
      performanceTracker.logRequest(endpoint, duration, 'ERROR');
      
      if (error.message === 'Failed to fetch') {
        apiAvailable = false;
        throw new Error('API_UNAVAILABLE');
      }
      throw error;
    }
  };

  // =====================
  // Auth API
  // =====================

  const auth = {
    async register(userData) {
      const data = await request('/auth/register', {
        method: 'POST',
        body: JSON.stringify(userData)
      });
      
      if (data.success && data.user) {
        // Cookie is set by server (httpOnly)
        setCachedUser(data.user);
      }
      
      return data;
    },

    async login(email, password) {
      const data = await request('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password })
      });
      
      if (data.success && data.user) {
        // Cookie is set by server (httpOnly)
        setCachedUser(data.user);
        
        // Sync local cart with server
        await cart.syncWithServer();
        // Persist lightweight marker for cross-page navigation
        try { localStorage.setItem('blackonn_logged_in', JSON.stringify({ id: data.user.id, ts: Date.now() })); } catch (e) {}
      }
      
      return data;
    },

    async logout() {
      try {
        await request('/auth/logout', { method: 'POST' });
      } catch (e) {
        // Continue even if server logout fails
      }
      
      clearCachedUser();
      try { localStorage.removeItem('blackonn_logged_in'); } catch (e) {}
      window.dispatchEvent(new Event('auth:logout'));
      
      return { success: true };
    },

    async verify() {
      try {
        return await request('/auth/verify');
      } catch (error) {
        if (error.message !== 'API_UNAVAILABLE') {
          clearCachedUser();
        }
        throw error;
      }
    },

    async forgotPassword(email) {
      return await request('/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email })
      });
    },

    async resetPassword(token, password) {
      return await request('/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ token, password })
      });
    },

    // Check if logged in (async - uses cached user from server)
    async isLoggedInAsync() {
      const user = await getCachedUser();
      return !!user;
    },

    // Sync check - uses cached state
    isLoggedIn() {
      return !!cachedUser && authChecked;
    },

    // Get current user (async)
    async getUserAsync() {
      return await getCachedUser();
    },

    // Get cached user (sync)
    getUser() {
      return cachedUser;
    },

    isAdmin() {
      return cachedUser && cachedUser.role === 'admin';
    }
  };

  // =====================
  // Products API
  // =====================

  const products = {
    async getAll() {
      return await request('/products');
    },

    async getById(id) {
      return await request(`/products/${id}`);
    },

    async getByPosition(position) {
      return await request(`/products/position/${position}`);
    },

    async create(productData) {
      return await request('/products', {
        method: 'POST',
        body: JSON.stringify(productData)
      });
    },

    async update(id, updates) {
      return await request(`/products/${id}`, {
        method: 'PUT',
        body: JSON.stringify(updates)
      });
    },

    async delete(id) {
      return await request(`/products/${id}`, {
        method: 'DELETE'
      });
    }
  };

  // =====================
  // Cart API
  // =====================

  const cart = {
    // Cache cart data in memory for UI updates (no localStorage)
    _cartCache: [],
    
    _getCartCache() {
      return this._cartCache || [];
    },

    _setCartCache(cartItems) {
      this._cartCache = cartItems || [];
      this._updateBadge(cartItems);
    },

    _updateBadge(cartItems) {
      const count = (cartItems || []).reduce((sum, item) => sum + item.quantity, 0);
      // Support both selector patterns used across the site
      const badges = document.querySelectorAll('.cart-badge, #cart-badge, .cart-count, #cart-count');
      badges.forEach(badge => {
        badge.textContent = count;
        // Handle both display patterns
        if (badge.classList.contains('cart-count')) {
          badge.classList.toggle('show', count > 0);
        } else {
          badge.style.display = count > 0 ? 'flex' : 'none';
        }
      });
      window.dispatchEvent(new CustomEvent('cart:updated', { detail: { count, cart: cartItems } }));
    },

    async get() {
      // Check auth state (async since we use cookies)
      const user = await getCachedUser();
      if (!user) {
        // Not logged in - return empty cart (require login for cart)
        return { 
          success: true, 
          cart: [],
          subtotal: 0,
          itemCount: 0,
          requiresLogin: true
        };
      }

      const data = await request('/cart');
      this._setCartCache(data.cart || []);
      return data;
    },

    async add(productOrItem, quantity = 1, selectedSize = null, selectedColor = null) {
      // Handle both calling conventions:
      // 1. add(cartItem) - object with all properties
      // 2. add(product, quantity, selectedSize, selectedColor) - separate params
      let payload;
      if (productOrItem && typeof productOrItem === 'object' && (productOrItem.selectedSize || productOrItem.quantity)) {
        // Called with a cart item object
        payload = {
          productId: productOrItem.productId || productOrItem.id,
          name: productOrItem.name,
          price: productOrItem.price,
          image: productOrItem.image || productOrItem.thumbImage,
          thumbImage: productOrItem.thumbImage || productOrItem.image,
          quantity: productOrItem.quantity || 1,
          selectedSize: productOrItem.selectedSize || 'M',
          selectedColor: productOrItem.selectedColor || productOrItem.color
        };
      } else {
        // Called with separate parameters
        payload = {
          productId: productOrItem.id || productOrItem,
          quantity,
          selectedSize: selectedSize || 'M',
          selectedColor
        };
      }

      try {
        const data = await request('/cart/add', {
          method: 'POST',
          body: JSON.stringify(payload)
        });
        this._setCartCache(data.cart || []);
        return data;
      } catch (error) {
        // If 401 unauthorized, return login required
        if (error.message && error.message.includes('401')) {
          return { success: false, error: 'Login required', requiresLogin: true };
        }
        throw error;
      }
    },

    async update(index, quantity) {
      try {
        const data = await request(`/cart/item/${index}`, {
          method: 'PUT',
          body: JSON.stringify({ quantity })
        });
        this._setCartCache(data.cart || []);
        return data;
      } catch (error) {
        if (error.message && error.message.includes('401')) {
          return { success: false, error: 'Login required', requiresLogin: true };
        }
        throw error;
      }
    },

    async remove(index) {
      try {
        const data = await request(`/cart/item/${index}`, {
          method: 'DELETE'
        });
        this._setCartCache(data.cart || []);
        return data;
      } catch (error) {
        if (error.message && error.message.includes('401')) {
          return { success: false, error: 'Login required', requiresLogin: true };
        }
        throw error;
      }
    },

    async clear() {
      try {
        const data = await request('/cart', { method: 'DELETE' });
        this._setCartCache([]);
        return data;
      } catch (error) {
        if (error.message && error.message.includes('401')) {
          this._setCartCache([]);
          return { success: false, error: 'Login required', requiresLogin: true };
        }
        throw error;
      }
    },

    async syncWithServer() {
      const user = await getCachedUser();
      if (!user) return;

      try {
        // Fetch server cart
        const data = await request('/cart');
        this._setCartCache(data.cart || []);
        return data;
      } catch (error) {
        console.warn('Cart sync failed:', error);
      }
    }
  };

  // =====================
  // Orders API
  // =====================

  const orders = {
    async getAll() {
      return await request('/orders');
    },

    async getMine() {
      return await request('/orders/my-orders');
    },

    async get(id) {
      return await request(`/orders/${id}`);
    },

    async getById(id) {
      return await request(`/orders/${id}`);
    },

    async create(orderData) {
      // Transform checkout order format to backend expected format
      const payload = {
        items: orderData.items || [],
        shippingInfo: {
          name: orderData.customer?.name || '',
          email: orderData.customer?.email || '',
          phone: orderData.customer?.phone || '',
          address: orderData.address?.street || '',
          city: orderData.address?.city || '',
          state: orderData.address?.state || '',
          postalCode: orderData.address?.postal || '',
          country: orderData.address?.country || 'India'
        },
        paymentMethod: orderData.paymentMethod || 'upi',
        subtotal: orderData.total || 0,
        shipping: 0,
        total: orderData.total || 0
      };
      
      const data = await request('/orders', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      
      return data;
    },

    async update(id, updates) {
      return await request(`/orders/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify(updates)
      });
    },

    async updateStatus(id, status) {
      return await request(`/orders/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status })
      });
    },

    async cancel(id) {
      return await request(`/orders/${id}/cancel`, {
        method: 'POST'
      });
    },

    async verifyPayment(id) {
      return await request(`/orders/${id}/verify-payment`, {
        method: 'POST'
      });
    },

    async getStats() {
      return await request('/orders/stats/summary');
    }
  };

  // =====================
  // Users API
  // =====================

  const users = {
    async getAll() {
      return await request('/users');
    },

    async getById(id) {
      return await request(`/users/${id}`);
    },

    async update(id, updates) {
      const data = await request(`/users/${id}`, {
        method: 'PUT',
        body: JSON.stringify(updates)
      });
      
      // Update cached user if updating self
      if (data.success && cachedUser?.id === id) {
        setCachedUser(data.user);
      }
      
      return data;
    },

    async changePassword(id, currentPassword, newPassword) {
      return await request(`/users/${id}/change-password`, {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword })
      });
    },

    async delete(id) {
      return await request(`/users/${id}`, {
        method: 'DELETE'
      });
    },

    async getStats() {
      return await request('/users/stats/summary');
    },

    // Address management
    async getAddresses(userId) {
      const user = cachedUser || await getCachedUser();
      const id = userId || user?.id;
      if (!id) return { success: false, error: 'Not authenticated', addresses: [] };
      return await request(`/users/${id}/addresses`);
    },

    async addAddress(addressOrUserId, addressData) {
      const user = cachedUser || await getCachedUser();
      // If only one argument, it's the address data
      let id, address;
      if (addressData === undefined) {
        id = user?.id;
        address = addressOrUserId;
      } else {
        id = addressOrUserId;
        address = addressData;
      }
      if (!id) return { success: false, error: 'Not authenticated' };
      return await request(`/users/${id}/addresses`, {
        method: 'POST',
        body: JSON.stringify(address)
      });
    },

    async updateAddress(addressIdOrUserId, updatesOrAddressId, updatesData) {
      const user = cachedUser || await getCachedUser();
      // If two arguments: (addressId, updates), if three: (userId, addressId, updates)
      let id, addressId, updates;
      if (updatesData === undefined) {
        id = user?.id;
        addressId = addressIdOrUserId;
        updates = updatesOrAddressId;
      } else {
        id = addressIdOrUserId;
        addressId = updatesOrAddressId;
        updates = updatesData;
      }
      if (!id) return { success: false, error: 'Not authenticated' };
      return await request(`/users/${id}/addresses/${addressId}`, {
        method: 'PUT',
        body: JSON.stringify(updates)
      });
    },

    async deleteAddress(addressIdOrUserId, addressIdData) {
      const user = cachedUser || await getCachedUser();
      // If one argument: (addressId), if two: (userId, addressId)
      let id, addressId;
      if (addressIdData === undefined) {
        id = user?.id;
        addressId = addressIdOrUserId;
      } else {
        id = addressIdOrUserId;
        addressId = addressIdData;
      }
      if (!id) return { success: false, error: 'Not authenticated' };
      return await request(`/users/${id}/addresses/${addressId}`, {
        method: 'DELETE'
      });
    }
  };

  // =====================
  // Wishlist API
  // =====================

  const wishlist = {
    async get() {
      try {
        return await request('/wishlist');
      } catch (error) {
        if (error.message && error.message.includes('401')) {
          return { success: true, wishlist: [], requiresLogin: true };
        }
        throw error;
      }
    },

    async add(product) {
      try {
        return await request('/wishlist', {
          method: 'POST',
          body: JSON.stringify({
            productId: product.id || product.productId,
            productIndex: product.productIndex,
            name: product.name,
            price: product.price,
            image: product.image
          })
        });
      } catch (error) {
        if (error.message && error.message.includes('401')) {
          return { success: false, error: 'Login required', requiresLogin: true };
        }
        throw error;
      }
    },

    async remove(itemId) {
      return await request(`/wishlist/${itemId}`, {
        method: 'DELETE'
      });
    },

    async clear() {
      return await request('/wishlist', {
        method: 'DELETE'
      });
    },

    async isInWishlist(productId) {
      const data = await this.get();
      if (!data.success || !data.wishlist) return false;
      return data.wishlist.some(item => 
        item.productId === productId || item.productIndex == productId
      );
    }
  };

  // =====================
  // Returns API
  // =====================

  const returns = {
    async getAll() {
      return await request('/returns');
    },

    async getMine() {
      return await request('/returns/my-returns');
    },

    async getById(id) {
      return await request(`/returns/${id}`);
    },

    async create(returnData) {
      return await request('/returns', {
        method: 'POST',
        body: JSON.stringify(returnData)
      });
    },

    async updateStatus(id, status, adminNotes) {
      return await request(`/returns/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status, adminNotes })
      });
    },

    async getStats() {
      return await request('/returns/stats/summary');
    }
  };

  // =====================
  // Exchanges API
  // =====================

  const exchanges = {
    async getAll() {
      return await request('/exchanges');
    },

    async getMine() {
      return await request('/exchanges/my-exchanges');
    },

    async getById(id) {
      return await request(`/exchanges/${id}`);
    },

    async create(exchangeData) {
      return await request('/exchanges', {
        method: 'POST',
        body: JSON.stringify(exchangeData)
      });
    },

    async updateStatus(id, status, adminNotes) {
      return await request(`/exchanges/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status, adminNotes })
      });
    },

    async delete(id) {
      return await request(`/exchanges/${id}`, {
        method: 'DELETE'
      });
    },

    async getStats() {
      return await request('/exchanges/stats/summary');
    }
  };

  // =====================
  // Cancellations API
  // =====================

  const cancellations = {
    async getAll() {
      return await request('/cancellations');
    },

    async getMine() {
      return await request('/cancellations/my-cancellations');
    },

    async getById(id) {
      return await request(`/cancellations/${id}`);
    },

    async create(cancellationData) {
      return await request('/cancellations', {
        method: 'POST',
        body: JSON.stringify(cancellationData)
      });
    },

    async updateStatus(id, status, adminNotes) {
      return await request(`/cancellations/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status, adminNotes })
      });
    },

    async delete(id) {
      return await request(`/cancellations/${id}`, {
        method: 'DELETE'
      });
    },

    async getStats() {
      return await request('/cancellations/stats/summary');
    }
  };

  // =====================
  // Contact API
  // =====================

  const contact = {
    async submit(messageData) {
      return await request('/contact', {
        method: 'POST',
        body: JSON.stringify(messageData)
      });
    },
    
    async send(messageData) {
      return await this.submit(messageData);
    },

    async getAll() {
      return await request('/contact');
    },

    async getById(id) {
      return await request(`/contact/${id}`);
    },

    async reply(id, replyText) {
      return await request(`/contact/${id}/reply`, {
        method: 'POST',
        body: JSON.stringify({ reply: replyText })
      });
    },

    async markRead(id, read = true) {
      return await request(`/contact/${id}/read`, {
        method: 'PATCH',
        body: JSON.stringify({ read })
      });
    },

    async updateStatus(id, status) {
      return await request(`/contact/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status })
      });
    },

    async delete(id) {
      return await request(`/contact/${id}`, {
        method: 'DELETE'
      });
    },

    async getUnreadCount() {
      return await request('/contact/stats/unread');
    },

    // Get current user's own queries/messages
    async getMine() {
      return await request('/contact/mine/list');
    },

    // User reply to their own query (follow-up)
    async userReply(id, replyText, attachments = []) {
      return await request(`/contact/mine/${id}/reply`, {
        method: 'POST',
        body: JSON.stringify({ reply: replyText, attachments })
      });
    }
  };

  // =====================
  // Slides API (Hero Slider)
  // =====================

  const slides = {
    // Get active slides (public)
    async getAll() {
      return await request('/slides');
    },

    // Get all slides including inactive (admin)
    async getAllAdmin() {
      return await request('/slides/all');
    },

    // Add new slide (admin)
    async create(slideData) {
      return await request('/slides', {
        method: 'POST',
        body: JSON.stringify(slideData)
      });
    },

    // Update slide (admin)
    async update(id, updates) {
      return await request(`/slides/${id}`, {
        method: 'PUT',
        body: JSON.stringify(updates)
      });
    },

    // Reorder slides (admin)
    async reorder(order) {
      return await request('/slides/reorder/positions', {
        method: 'PUT',
        body: JSON.stringify({ order })
      });
    },

    // Delete slide (admin)
    async delete(id) {
      return await request(`/slides/${id}`, {
        method: 'DELETE'
      });
    }
  };

  // =====================
  // Initialize
  // =====================

  // Check API availability and auth state on load
  checkApiAvailable().then(() => {
    // Pre-fetch user auth state (uses httpOnly cookie)
    getCachedUser().catch(() => {});
  });

  // Initialize cart badge on page load
  document.addEventListener('DOMContentLoaded', async () => {
    try {
      const data = await cart.get();
      if (data.success) {
        cart._updateBadge(data.cart);
      }
    } catch {
      // Ignore errors, badge will show 0
    }
  });

  // =====================
  // Public API
  // =====================

  return {
    auth,
    products,
    cart,
    orders,
    users,
    wishlist,
    returns,
    exchanges,
    cancellations,
    contact,
    slides,
    checkApiAvailable,
    getPerformanceStats: () => performanceTracker.getStats(),
    isApiAvailable: () => apiAvailable,
    getBaseUrl: () => BASE_URL,
    // Export auth state helpers
    getCachedUser,
    clearCachedUser
  };
})();

/* Global toast utility (safe - idempotent) */
(function () {
  if (window.showToast) return;

  function createContainer() {
    let c = document.querySelector('.toast-container');
    if (!c) {
      c = document.createElement('div');
      c.className = 'toast-container';
      c.setAttribute('role', 'region');
      c.setAttribute('aria-label', 'Notifications');
      c.setAttribute('aria-live', 'polite');
      document.body.appendChild(c);
    }
    return c;
  }

  window.showNotification = function (message, type = 'info', timeout = 4000) {
    try {
      const container = createContainer();
      const toast = document.createElement('div');
      toast.className = `toast ${type}`;
      toast.setAttribute('role', 'alert');
      toast.setAttribute('aria-live', type === 'error' ? 'assertive' : 'polite');
      toast.setAttribute('aria-atomic', 'true');
      
      // Dynamic Island style icons
      const icons = {
        success: '<i class="ri-check-line" aria-hidden="true"></i>',
        error: '<i class="ri-close-line" aria-hidden="true"></i>',
        warning: '<i class="ri-alert-line" aria-hidden="true"></i>',
        info: '<i class="ri-information-line" aria-hidden="true"></i>'
      };
      
      toast.innerHTML = `
        <span class="toast-icon" aria-hidden="true">${icons[type] || icons.info}</span>
        <span class="toast-message">${message}</span>
        <button class="toast-close" aria-label="Dismiss notification"><i class="ri-close-line" aria-hidden="true"></i></button>
        <div class="toast-progress" aria-hidden="true"><div class="toast-progress-bar" style="animation-duration: ${timeout}ms"></div></div>
      `;
      container.appendChild(toast);

      const remove = () => {
        toast.style.animation = 'toastIslandOut 0.3s ease forwards';
        setTimeout(() => toast.remove(), 300);
      };

      // Auto-dismiss
      const t = setTimeout(remove, timeout);

      // Manual dismiss on close button click
      const closeBtn = toast.querySelector('.toast-close');
      if (closeBtn) {
        closeBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          clearTimeout(t);
          remove();
        });
      }
      
      // Also dismiss on toast click
      toast.addEventListener('click', () => {
        clearTimeout(t);
        remove();
      });
    } catch (e) {
      // Fallback to alert if DOM unavailable
      try { alert(message); } catch (_) { console.log(message); }
    }
  };

  // Alias for backward compatibility
  window.showToast = window.showNotification;
})();

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
  module.exports = API;
}

// Create global alias for easier access
window.BlackonnAPI = {
  getProducts: async () => API.products.getAll(),
  getProductById: async (id) => API.products.getById(id),
  createOrder: async (orderData) => API.orders.create(orderData),
  getOrders: async () => API.orders.getMine(),
  submitContact: async (data) => API.contact.send(data),
  cart: API.cart,
  auth: API.auth,
  products: API.products,
  orders: API.orders,
  users: API.users,
  wishlist: API.wishlist,
  returns: API.returns,
  contact: API.contact,
  slides: API.slides,
  baseUrl: API.getBaseUrl()
};
