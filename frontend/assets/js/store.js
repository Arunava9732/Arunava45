/**
 * BLACKONN Static Data Store - AI Enhanced
 * ⚠️ DEPRECATED: This file is for static GitHub Pages only (no backend)
 * 
 * For production cloud/server deployment, use api.js instead.
 * All data is now managed server-side with httpOnly cookies for auth.
 * 
 * This file is kept for:
 * 1. Static product display fallback
 * 2. Legacy compatibility
 * 3. GitHub Pages demo mode
 * 
 * AI Features:
 * - Product recommendation tracking
 * - User behavior analytics
 * - Cart abandonment tracking
 */

const BlackonnStore = {
  // Storage keys (for static mode only)
  KEYS: {
    PRODUCTS: 'blackonn_products',
    CART: 'blackonn_cart',
    WISHLIST: 'blackonn_wishlist',
    USER: 'blackonn_user',
    ORDERS: 'blackonn_orders'
  },
  
  // AI Tracking
  aiTracker: {
    trackEvent(event, data) {
      if (window.AIAnalytics) {
        window.AIAnalytics.track(event, data);
      }
    }
  },

  // Embedded products data (fallback for static mode)
  DEFAULT_PRODUCTS: [],

  // Initialize store - load products from embedded data (no fetch needed)
  init() {
    try {
      const existingProducts = localStorage.getItem(this.KEYS.PRODUCTS);

      // Seed products only when missing or corrupted to keep admin edits
      if (!existingProducts) {
        localStorage.setItem(this.KEYS.PRODUCTS, JSON.stringify(this.DEFAULT_PRODUCTS));
      } else {
        try {
          const parsed = JSON.parse(existingProducts);
          if (!Array.isArray(parsed) || !parsed.length) {
            localStorage.setItem(this.KEYS.PRODUCTS, JSON.stringify(this.DEFAULT_PRODUCTS));
          }
        } catch (err) {
          localStorage.setItem(this.KEYS.PRODUCTS, JSON.stringify(this.DEFAULT_PRODUCTS));
        }
      }

      // Ensure cart, wishlist, and orders keys exist so pages don't fail on empty state
      ['CART', 'WISHLIST', 'ORDERS'].forEach(key => {
        const storageKey = this.KEYS[key];
        try {
          const val = localStorage.getItem(storageKey);
          if (!val) {
            localStorage.setItem(storageKey, JSON.stringify([]));
          } else {
            JSON.parse(val);
          }
        } catch {
          localStorage.setItem(storageKey, JSON.stringify([]));
        }
      });

      // Cross-tab sync for badge counts (storage event fires on other tabs)
      if (!this._storageListenerAttached) {
        window.addEventListener('storage', (e) => {
          if (!e.key || !Object.values(this.KEYS).includes(e.key)) return;
          this.updateCartCount();
          this.updateWishlistCount();
        });
        this._storageListenerAttached = true;
      }
    } catch (err) {
      // If anything goes wrong, fall back to defaults
      localStorage.setItem(this.KEYS.PRODUCTS, JSON.stringify(this.DEFAULT_PRODUCTS));
      ['CART', 'WISHLIST', 'ORDERS'].forEach(key => {
        localStorage.setItem(this.KEYS[key], JSON.stringify([]));
      });
    }

    return Promise.resolve();
  },

  // Get all products
  getProducts() {
    try {
      const products = localStorage.getItem(this.KEYS.PRODUCTS);
      if (products) {
        return JSON.parse(products);
      }
      // Fallback to default products
      return this.DEFAULT_PRODUCTS;
    } catch {
      return this.DEFAULT_PRODUCTS;
    }
  },

  // Get product by ID
  getProductById(id) {
    const products = this.getProducts();
    return products.find(p => p.id === id);
  },

  // Get products by position (for homepage)
  getProductsByPosition(positions) {
    const products = this.getProducts();
    return products
      .filter(p => positions.includes(p.position))
      .sort((a, b) => a.position - b.position);
  },

  // Cart functions
  getCart() {
    try {
      const cart = localStorage.getItem(this.KEYS.CART);
      return cart ? JSON.parse(cart) : [];
    } catch {
      return [];
    }
  },

  addToCart(product, quantity = 1, selectedSize = 'M', selectedColor = '') {
    const cart = this.getCart();
    const existingIndex = cart.findIndex(
      item => item.id === product.id && 
              item.selectedSize === selectedSize && 
              item.selectedColor === selectedColor
    );

    if (existingIndex > -1) {
      cart[existingIndex].quantity += quantity;
    } else {
      cart.push({
        id: product.id,
        name: product.name,
        price: product.price,
        image: product.image,
        thumbImages: product.thumbImages,
        color: product.color,
        size: product.size,
        selectedSize,
        selectedColor: selectedColor || product.color,
        quantity
      });
    }

    localStorage.setItem(this.KEYS.CART, JSON.stringify(cart));
    this.updateCartCount();
    return cart;
  },

  updateCartItem(index, quantity) {
    const cart = this.getCart();
    if (index >= 0 && index < cart.length) {
      if (quantity <= 0) {
        cart.splice(index, 1);
      } else {
        cart[index].quantity = quantity;
      }
      localStorage.setItem(this.KEYS.CART, JSON.stringify(cart));
      this.updateCartCount();
    }
    return cart;
  },

  removeFromCart(index) {
    const cart = this.getCart();
    if (index >= 0 && index < cart.length) {
      cart.splice(index, 1);
      localStorage.setItem(this.KEYS.CART, JSON.stringify(cart));
      this.updateCartCount();
    }
    return cart;
  },

  clearCart() {
    localStorage.setItem(this.KEYS.CART, JSON.stringify([]));
    this.updateCartCount();
  },

  getCartTotal() {
    const cart = this.getCart();
    return cart.reduce((total, item) => total + (item.price * item.quantity), 0);
  },

  getCartCount() {
    const cart = this.getCart();
    return cart.reduce((count, item) => count + item.quantity, 0);
  },

  updateCartCount() {
    const count = this.getCartCount();
    document.querySelectorAll('.cart-count, #cart-count').forEach(el => {
      el.textContent = count;
      el.style.display = count > 0 ? 'flex' : 'none';
    });
  },

  // Wishlist functions
  getWishlist() {
    try {
      const wishlist = localStorage.getItem(this.KEYS.WISHLIST);
      return wishlist ? JSON.parse(wishlist) : [];
    } catch {
      return [];
    }
  },

  addToWishlist(product) {
    const wishlist = this.getWishlist();
    if (!wishlist.find(item => item.id === product.id)) {
      wishlist.push({
        id: product.id,
        name: product.name,
        price: product.price,
        image: product.image,
        thumbImages: product.thumbImages,
        color: product.color,
        size: product.size
      });
      localStorage.setItem(this.KEYS.WISHLIST, JSON.stringify(wishlist));
      this.updateWishlistCount();
    }
    return wishlist;
  },

  removeFromWishlist(productId) {
    let wishlist = this.getWishlist();
    wishlist = wishlist.filter(item => item.id !== productId);
    localStorage.setItem(this.KEYS.WISHLIST, JSON.stringify(wishlist));
    this.updateWishlistCount();
    return wishlist;
  },

  isInWishlist(productId) {
    const wishlist = this.getWishlist();
    return wishlist.some(item => item.id === productId);
  },

  getWishlistCount() {
    return this.getWishlist().length;
  },

  updateWishlistCount() {
    const count = this.getWishlistCount();
    document.querySelectorAll('.wishlist-count, #wishlist-count').forEach(el => {
      el.textContent = count;
      el.style.display = count > 0 ? 'flex' : 'none';
    });
  },

  // User/Auth functions (localStorage based)
  getUser() {
    try {
      const user = localStorage.getItem(this.KEYS.USER);
      return user ? JSON.parse(user) : null;
    } catch {
      return null;
    }
  },

  login(email, password) {
    // For static site, we'll use a simple localStorage auth
    // In production, you'd use a service like Firebase Auth
    const users = this.getStoredUsers();
    const user = users.find(u => u.email === email && u.password === password);
    
    if (user) {
      const userData = { id: user.id, name: user.name, email: user.email };
      localStorage.setItem(this.KEYS.USER, JSON.stringify(userData));
      return { success: true, user: userData };
    }
    return { success: false, message: 'Invalid email or password' };
  },

  signup(name, email, password) {
    const users = this.getStoredUsers();
    
    if (users.find(u => u.email === email)) {
      return { success: false, message: 'Email already exists' };
    }

    const newUser = {
      id: 'user_' + Date.now(),
      name,
      email,
      password,
      createdAt: new Date().toISOString()
    };

    users.push(newUser);
    localStorage.setItem('blackonn_users', JSON.stringify(users));

    const userData = { id: newUser.id, name: newUser.name, email: newUser.email };
    localStorage.setItem(this.KEYS.USER, JSON.stringify(userData));
    
    return { success: true, user: userData };
  },

  logout() {
    localStorage.removeItem(this.KEYS.USER);
  },

  isLoggedIn() {
    return this.getUser() !== null;
  },

  getStoredUsers() {
    try {
      const users = localStorage.getItem('blackonn_users');
      return users ? JSON.parse(users) : [];
    } catch {
      return [];
    }
  },

  // Orders (stored locally)
  getOrders() {
    try {
      const orders = localStorage.getItem(this.KEYS.ORDERS);
      return orders ? JSON.parse(orders) : [];
    } catch {
      return [];
    }
  },

  createOrder(shippingInfo, paymentMethod) {
    const cart = this.getCart();
    const user = this.getUser();

    if (cart.length === 0) {
      return { success: false, message: 'Cart is empty' };
    }

    const order = {
      id: 'ORD' + Date.now(),
      userId: user?.id || 'guest',
      userEmail: user?.email || shippingInfo.email,
      userName: user?.name || shippingInfo.name,
      items: cart,
      shippingInfo,
      paymentMethod,
      subtotal: this.getCartTotal(),
      shipping: this.getCartTotal() >= 999 ? 0 : 99,
      total: this.getCartTotal() + (this.getCartTotal() >= 999 ? 0 : 99),
      status: 'pending',
      createdAt: new Date().toISOString()
    };

    const orders = this.getOrders();
    orders.unshift(order);
    localStorage.setItem(this.KEYS.ORDERS, JSON.stringify(orders));

    // Clear cart after order
    this.clearCart();

    return { success: true, order };
  },

  getUserOrders() {
    const user = this.getUser();
    if (!user) return [];
    
    const orders = this.getOrders();
    return orders.filter(o => o.userId === user.id);
  },

  // Utility functions
  formatPrice(price) {
    return '₹' + price.toLocaleString('en-IN');
  },

  showNotification(message, type = 'success') {
    // Use the global showToast for Dynamic Island style notifications
    if (window.showToast) {
      window.showToast(message, type, 3000);
      return;
    }
    
    // Fallback: Remove existing notifications
    document.querySelectorAll('.store-notification').forEach(n => n.remove());

    const notification = document.createElement('div');
    notification.className = `store-notification ${type}`;
    
    const icons = {
      success: '✓',
      error: '✕',
      warning: '⚠',
      info: 'ℹ'
    };
    
    notification.innerHTML = `
      <span class="notif-icon">${icons[type] || icons.info}</span>
      <span class="notif-msg">${message}</span>
      <button class="notif-close" onclick="this.parentElement.remove()">✕</button>
    `;
    notification.style.cssText = `
      position: fixed;
      top: 16px;
      left: 50%;
      transform: translateX(-50%);
      padding: 12px 20px;
      background: ${type === 'success' ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.95), rgba(5, 150, 105, 0.95))' : 
                    type === 'error' ? 'linear-gradient(135deg, rgba(239, 68, 68, 0.95), rgba(220, 38, 38, 0.95))' : 
                    type === 'warning' ? 'linear-gradient(135deg, rgba(245, 158, 11, 0.95), rgba(217, 119, 6, 0.95))' :
                    'linear-gradient(135deg, rgba(15, 23, 42, 0.95), rgba(30, 41, 59, 0.95))'};
      color: ${type === 'warning' ? '#111' : 'white'};
      border-radius: 50px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.25), 0 2px 8px rgba(0,0,0,0.15);
      z-index: 99999;
      display: flex;
      align-items: center;
      gap: 10px;
      font-weight: 500;
      font-size: 0.9rem;
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      animation: islandIn 0.5s ease forwards;
      cursor: pointer;
    `;

    document.body.appendChild(notification);

    setTimeout(() => {
      notification.style.animation = 'islandOut 0.3s ease forwards';
      setTimeout(() => notification.remove(), 300);
    }, 3000);
  }
};

// Add CSS animations for Dynamic Island style notifications
const style = document.createElement('style');
style.textContent = `
  @keyframes islandIn {
    0% { opacity: 0; transform: translateX(-50%) translateY(-20px) scale(0.8); }
    50% { opacity: 1; }
    100% { opacity: 1; transform: translateX(-50%) translateY(0) scale(1); }
  }
  @keyframes islandOut {
    0% { opacity: 1; transform: translateX(-50%) translateY(0) scale(1); }
    100% { opacity: 0; transform: translateX(-50%) translateY(-10px) scale(0.9); }
  }
  .store-notification .notif-icon {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    background: rgba(255, 255, 255, 0.2);
  }
  .store-notification .notif-close {
    width: 20px;
    height: 20px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 10px;
    background: rgba(255, 255, 255, 0.15);
    border: none;
    color: inherit;
    cursor: pointer;
    opacity: 0.6;
    transition: opacity 0.2s ease;
  }
  .store-notification .notif-close:hover {
    opacity: 1;
    background: rgba(255, 255, 255, 0.25);
  }
`;
document.head.appendChild(style);

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
  BlackonnStore.init();
  BlackonnStore.updateCartCount();
  BlackonnStore.updateWishlistCount();
});

// Export for use
window.BlackonnStore = BlackonnStore;
