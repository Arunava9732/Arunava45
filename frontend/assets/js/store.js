/**
 * BLACKONN Static Data Store
 * ⚠️ DEPRECATED: This file is for static GitHub Pages only (no backend)
 * 
 * For production cloud/server deployment, use api.js instead.
 * All data is now managed server-side with httpOnly cookies for auth.
 * 
 * This file is kept for:
 * 1. Static product display fallback
 * 2. Legacy compatibility
 * 3. GitHub Pages demo mode
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

  // Embedded products data (fallback for static mode)
  DEFAULT_PRODUCTS: [
    {
      id: "prod-001",
      name: "Over Sized T-Shirt",
      price: 1499,
      color: "Black",
      size: "All",
      stock: 100,
      position: 1,
      image: "/uploads/products/1766256485041_oorxuo.png",
      thumbImages: ["/uploads/products/1766256485041_oorxuo.png", "/uploads/products/1766300543944_lcdhiw.png"]
    },
    {
      id: "prod-002",
      name: "Slim Fit T-Shirt",
      price: 599,
      color: "Red and Blue",
      size: "All",
      stock: 150,
      position: 2,
      image: "/uploads/products/1766256517720_hcxarp.png",
      thumbImages: ["/uploads/products/1766256517720_hcxarp.png", "/uploads/products/1766304774184_nz59z8.png"]
    },
    {
      id: "prod-003",
      name: "CAP",
      price: 399,
      color: "Black",
      size: "All",
      stock: 200,
      position: 3,
      image: "/uploads/products/1766256568248_klqmvk.png",
      thumbImages: ["/uploads/products/1766256568248_klqmvk.png", "/uploads/products/1766305297632_oepikm.png"]
    },
    {
      id: "prod-004",
      name: "BAG",
      price: 1799,
      color: "Black",
      size: "One Size",
      stock: 75,
      position: 4,
      image: "/uploads/products/1766256649355_hpnrsv.png",
      thumbImages: ["/uploads/products/1766256649355_hpnrsv.png", "/uploads/products/1766305433978_ro3m77.png"]
    },
    {
      id: "prod-005",
      name: "Hoodie",
      price: 1999,
      color: "Black",
      size: "All",
      stock: 80,
      position: 5,
      image: "/uploads/products/1766256703180_kqw3g7.png",
      thumbImages: ["/uploads/products/1766256703180_kqw3g7.png", "/uploads/products/1766305203633_pi904w.png"]
    },
    {
      id: "prod-006",
      name: "Pants",
      price: 1299,
      color: "All",
      size: "All",
      stock: 120,
      position: 6,
      image: "/uploads/products/1766258492979_8sibcs.png",
      thumbImages: ["/uploads/products/1766258492979_8sibcs.png", "/uploads/products/1766305507705_rtn6gs.png"]
    }
  ],

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
    // Remove existing notifications
    document.querySelectorAll('.store-notification').forEach(n => n.remove());

    const notification = document.createElement('div');
    notification.className = `store-notification ${type}`;
    notification.innerHTML = `
      <span>${message}</span>
      <button onclick="this.parentElement.remove()">&times;</button>
    `;
    notification.style.cssText = `
      position: fixed;
      top: 100px;
      right: 20px;
      padding: 15px 20px;
      background: ${type === 'success' ? '#4CAF50' : type === 'error' ? '#f44336' : '#2196F3'};
      color: white;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      z-index: 10000;
      display: flex;
      align-items: center;
      gap: 10px;
      animation: slideIn 0.3s ease;
    `;

    document.body.appendChild(notification);

    setTimeout(() => {
      notification.style.animation = 'slideOut 0.3s ease';
      setTimeout(() => notification.remove(), 300);
    }, 3000);
  }
};

// Add CSS animations
const style = document.createElement('style');
style.textContent = `
  @keyframes slideIn {
    from { transform: translateX(100%); opacity: 0; }
    to { transform: translateX(0); opacity: 1; }
  }
  @keyframes slideOut {
    from { transform: translateX(0); opacity: 1; }
    to { transform: translateX(100%); opacity: 0; }
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
