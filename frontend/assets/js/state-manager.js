/**
 * Advanced State Management System
 * Provides reactive state, pub/sub, and real-time sync capabilities
 */

(function() {
  'use strict';
  
  const StateManager = {
    state: {},
    subscribers: {},
    history: [],
    maxHistory: 50,
    persistKey: 'blackonn_state_v1',
    
    /**
     * Initialize state manager
     */
    init(initialState = {}) {
      // Load persisted state
      const persisted = this.loadState();
      this.state = { ...initialState, ...persisted };
      
      // Setup auto-persist
      this.setupAutoPersist();
      
      // Setup sync with other tabs
      this.setupCrossTabSync();
    },
    
    /**
     * Get system statistics for dashboard
     */
    getStats() {
      return {
        keys: Object.keys(this.state).length,
        historySize: this.history.length,
        subscribers: Object.keys(this.subscribers).length,
        persisted: !!localStorage.getItem(this.persistKey)
      };
    },

    /**
     * Get state value
     */
    get(key) {
      if (!key) return { ...this.state };
      
      const keys = key.split('.');
      let value = this.state;
      
      for (const k of keys) {
        if (value && typeof value === 'object' && k in value) {
          value = value[k];
        } else {
          return undefined;
        }
      }
      
      return value;
    },
    
    /**
     * Set state value
     */
    set(key, value, notify = true) {
      const oldValue = this.get(key);
      
      // Handle nested keys
      const keys = key.split('.');
      let target = this.state;
      
      for (let i = 0; i < keys.length - 1; i++) {
        const k = keys[i];
        if (!(k in target) || typeof target[k] !== 'object') {
          target[k] = {};
        }
        target = target[k];
      }
      
      target[keys[keys.length - 1]] = value;
      
      // Add to history
      this.addToHistory({
        action: 'set',
        key,
        oldValue,
        newValue: value,
        timestamp: Date.now()
      });
      
      // Notify subscribers
      if (notify) {
        this.notify(key, value, oldValue);
      }
    },
    
    /**
     * Update state (merge objects)
     */
    update(key, updates, notify = true) {
      const current = this.get(key);
      
      if (typeof current === 'object' && !Array.isArray(current)) {
        this.set(key, { ...current, ...updates }, notify);
      } else {
        this.set(key, updates, notify);
      }
    },
    
    /**
     * Delete state value
     */
    delete(key, notify = true) {
      const oldValue = this.get(key);
      
      const keys = key.split('.');
      let target = this.state;
      
      for (let i = 0; i < keys.length - 1; i++) {
        target = target[keys[i]];
        if (!target) return;
      }
      
      delete target[keys[keys.length - 1]];
      
      // Add to history
      this.addToHistory({
        action: 'delete',
        key,
        oldValue,
        timestamp: Date.now()
      });
      
      // Notify subscribers
      if (notify) {
        this.notify(key, undefined, oldValue);
      }
    },
    
    /**
     * Subscribe to state changes
     */
    subscribe(key, callback) {
      if (!this.subscribers[key]) {
        this.subscribers[key] = [];
      }
      
      this.subscribers[key].push(callback);
      
      // Return unsubscribe function
      return () => {
        const index = this.subscribers[key].indexOf(callback);
        if (index > -1) {
          this.subscribers[key].splice(index, 1);
        }
      };
    },
    
    /**
     * Notify subscribers
     */
    notify(key, newValue, oldValue) {
      // Notify exact key subscribers
      if (this.subscribers[key]) {
        this.subscribers[key].forEach(callback => {
          try {
            callback(newValue, oldValue, key);
          } catch (error) {
            console.error('[STATE] Subscriber error:', error);
          }
        });
      }
      
      // Notify wildcard subscribers
      if (this.subscribers['*']) {
        this.subscribers['*'].forEach(callback => {
          try {
            callback(newValue, oldValue, key);
          } catch (error) {
            console.error('[STATE] Wildcard subscriber error:', error);
          }
        });
      }
    },
    
    /**
     * Add to history
     */
    addToHistory(entry) {
      this.history.push(entry);
      
      if (this.history.length > this.maxHistory) {
        this.history.shift();
      }
    },
    
    /**
     * Get state history
     */
    getHistory(key = null) {
      if (!key) return [...this.history];
      
      return this.history.filter(entry => entry.key === key);
    },
    
    /**
     * Undo last change
     */
    undo() {
      const last = this.history.pop();
      
      if (!last) {
        console.warn('[STATE] Nothing to undo');
        return false;
      }
      
      if (last.action === 'set') {
        if (last.oldValue === undefined) {
          this.delete(last.key, false);
        } else {
          this.set(last.key, last.oldValue, false);
        }
      } else if (last.action === 'delete') {
        this.set(last.key, last.oldValue, false);
      }
      
      console.log('[STATE] Undone:', last);
      return true;
    },
    
    /**
     * Persist state to localStorage
     */
    persist() {
      try {
        const serialized = JSON.stringify({
          state: this.state,
          timestamp: Date.now()
        });
        localStorage.setItem(this.persistKey, serialized);
      } catch (error) {
        console.error('[STATE] Persist failed:', error);
      }
    },
    
    /**
     * Load state from localStorage
     */
    loadState() {
      try {
        const serialized = localStorage.getItem(this.persistKey);
        if (!serialized) return {};
        
        const { state, timestamp } = JSON.parse(serialized);
        
        // Check if state is too old (> 24 hours)
        if (Date.now() - timestamp > 24 * 60 * 60 * 1000) {
          console.log('[STATE] Persisted state expired');
          return {};
        }
        
        return state;
      } catch (error) {
        console.error('[STATE] Load failed:', error);
        return {};
      }
    },
    
    /**
     * Setup auto-persist
     */
    setupAutoPersist() {
      // Persist on state change
      this.subscribe('*', () => {
        clearTimeout(this._persistTimeout);
        this._persistTimeout = setTimeout(() => this.persist(), 500);
      });
      
      // Persist before unload
      window.addEventListener('beforeunload', () => this.persist());
    },
    
    /**
     * Setup cross-tab synchronization
     */
    setupCrossTabSync() {
      window.addEventListener('storage', (event) => {
        if (event.key === this.persistKey && event.newValue) {
          try {
            const { state } = JSON.parse(event.newValue);
            
            // Update local state without notifying
            this.state = state;
            
            // Notify all subscribers
            Object.keys(this.subscribers).forEach(key => {
              if (key !== '*') {
                this.notify(key, this.get(key), undefined);
              }
            });
            
            console.log('[STATE] Synced from another tab');
          } catch (error) {
            console.error('[STATE] Sync failed:', error);
          }
        }
      });
    },
    
    /**
     * Clear all state
     */
    clear() {
      this.state = {};
      this.history = [];
      localStorage.removeItem(this.persistKey);
      
      // Notify all subscribers
      Object.keys(this.subscribers).forEach(key => {
        this.notify(key, undefined, undefined);
      });
      
      console.log('[STATE] Cleared all state');
    },
    
    /**
     * Export state
     */
    export() {
      return {
        state: { ...this.state },
        history: [...this.history],
        timestamp: Date.now()
      };
    },
    
    /**
     * Import state
     */
    import(data) {
      this.state = data.state || {};
      this.history = data.history || [];
      this.persist();
      
      console.log('[STATE] Imported state');
    },
    
    /**
     * Compute derived state
     */
    compute(key, computeFn, dependencies = []) {
      const compute = () => {
        const values = dependencies.map(dep => this.get(dep));
        const computed = computeFn(...values);
        this.set(key, computed, false);
      };
      
      // Compute initially
      compute();
      
      // Re-compute when dependencies change
      dependencies.forEach(dep => {
        this.subscribe(dep, compute);
      });
    },
    
    /**
     * Batch updates
     */
    batch(updateFn) {
      const originalNotify = this.notify;
      const notifications = [];
      
      // Collect notifications
      this.notify = (key, newValue, oldValue) => {
        notifications.push({ key, newValue, oldValue });
      };
      
      try {
        updateFn(this);
      } finally {
        // Restore notify and execute all notifications
        this.notify = originalNotify;
        notifications.forEach(({ key, newValue, oldValue }) => {
          this.notify(key, newValue, oldValue);
        });
      }
    },
    
    /**
     * Debounce state updates
     */
    setDebounced(key, value, delay = 300) {
      clearTimeout(this._debounceTimers?.[key]);
      
      if (!this._debounceTimers) {
        this._debounceTimers = {};
      }
      
      this._debounceTimers[key] = setTimeout(() => {
        this.set(key, value);
      }, delay);
    },
    
    /**
     * Watch for changes
     */
    watch(key, handler) {
      return this.subscribe(key, (newValue, oldValue) => {
        handler(newValue, oldValue);
      });
    }
  };
  
  // Initialize with default state
  StateManager.init({
    user: null,
    cart: [],
    wishlist: [],
    theme: 'dark',
    language: 'en',
    currency: 'INR',
    offline: !navigator.onLine
  });
  
  // Monitor online/offline status
  window.addEventListener('online', () => StateManager.set('offline', false));
  window.addEventListener('offline', () => StateManager.set('offline', true));
  
  // Expose globally
  window.StateManager = StateManager;
  
  console.log('[STATE] State management system ready');
})();
