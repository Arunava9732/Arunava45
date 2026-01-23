/**
 * Neural Commerce - Real Intent Prediction
 * Tracks user behavior and predicts purchase intent using backend ML
 * @version 2.0.0
 */

class NeuralCommerce {
  constructor() {
    this.behavior = {
      viewedProducts: 0,
      addedToCart: false,
      searched: false,
      dwellTime: 0,
      pageViews: []
    };
    this.prediction = null;
    this.startTime = Date.now();
    
    this.init();
  }

  init() {
    console.log('[Neural Commerce] Initializing real-time intent prediction...');
    this.setupTracking();
    this.loadState();
    
    // Initial prediction after 10 seconds of activity
    setTimeout(() => this.predictIntent(), 10000);
  }

  setupTracking() {
    // Track product views
    if (window.location.pathname.includes('product')) {
      this.behavior.viewedProducts++;
      this.saveState();
    }

    // Track search
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('search')) {
      this.behavior.searched = true;
      this.saveState();
    }

    // Track add to cart (listen for global events)
    window.addEventListener('cart:added', () => {
      this.behavior.addedToCart = true;
      this.predictIntent(); // Immediate re-prediction
      this.saveState();
    });

    // Track dwell time
    window.addEventListener('beforeunload', () => {
      this.behavior.dwellTime += (Date.now() - this.startTime) / 1000;
      this.saveState();
    });
  }

  saveState() {
    sessionStorage.setItem('blackonn_neural_state', JSON.stringify(this.behavior));
  }

  loadState() {
    const saved = sessionStorage.getItem('blackonn_neural_state');
    if (saved) {
      try {
        this.behavior = JSON.parse(saved);
      } catch (e) {
        console.error('[Neural Commerce] Failed to load state');
      }
    }
  }

  async predictIntent() {
    try {
      const payload = {
        userId: localStorage.getItem('userId') || 'guest',
        sessionId: sessionStorage.getItem('blackonn_session_id') || 'anon',
        behavior: {
          ...this.behavior,
          totalSessionTime: (Date.now() - this.startTime) / 1000
        },
        context: {
          page: window.location.pathname,
          referrer: document.referrer
        }
      };

      const response = await fetch('/api/admin/neural-commerce/predict', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        credentials: 'include'
      });

      const data = await response.json();
      if (data.success) {
        this.prediction = data.prediction;
        console.log('[Neural Commerce] Predicted Intent:', this.prediction.intent, `(${Math.round(this.prediction.confidence * 100)}%)`);
        this.applyTactics(this.prediction);
      }
    } catch (error) {
      console.debug('[Neural Commerce] Prediction failed (expected if admin API restricted)', error);
    }
  }

  applyTactics(prediction) {
    // Dynamic UI adjustments based on intent
    if (prediction.intent === 'purchase' && !this.behavior.addedToCart) {
      // Highlight "Add to Cart" or show a special offer
      const cta = document.querySelector('.add-to-cart-btn');
      if (cta) cta.style.animation = 'pulse 2s infinite';
    }
  }

  getStats() {
    return {
      intent: this.prediction?.intent || 'browsing',
      confidence: this.prediction?.confidence || 0.5,
      predictions: 1, // session prediction count
      purchaseIntents: this.prediction?.intent === 'purchase' ? 1 : 0
    };
  }
}

// Auto-init
window.neuralCommerce = new NeuralCommerce();
