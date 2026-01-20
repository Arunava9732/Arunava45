/**
 * Real-time Manager with WebSocket Support
 * Provides live updates, presence tracking, and real-time synchronization
 * @version 2.0.0
 */

class RealtimeManager {
  constructor() {
    this.ws = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
    this.reconnectDelay = 1000;
    this.heartbeatInterval = null;
    this.messageQueue = [];
    this.subscriptions = new Map();
    this.presenceUsers = new Map();
    this.isConnected = false;
    this.config = {
      heartbeatInterval: 30000,
      reconnectBackoff: 2,
      maxReconnectDelay: 30000,
      messageTimeout: 5000,
      enablePresence: true,
      enableTypingIndicators: true,
      enableReadReceipts: true
    };
    
    this.stats = {
      messagesReceived: 0,
      messagesSent: 0,
      reconnects: 0,
      errors: 0,
      avgLatency: 0,
      lastPingTime: 0
    };

    this.listeners = {
      connect: [],
      disconnect: [],
      error: [],
      message: [],
      presence: [],
      typing: []
    };

    this.connectionState = 'disconnected'; // disconnected, connecting, connected, reconnecting
    this.startTime = Date.now();
    this.messageCount = 0;
    this.eventCount = 0;
    this.connectedClients = this.presenceUsers;
  }

  /**
   * Initialize WebSocket connection
   */
  async init(wsUrl = null) {
    try {
      // Auto-detect WebSocket URL
      if (!wsUrl) {
        const isDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const hostname = window.location.hostname;
        let port = window.location.port;
        
        // Handle Live Server (port 5500) vs Backend (port 3000)
        if (isDev && port === '5500') {
          port = '3000';
        }
        
        // Build WS URL - simplify for production
        // Removed /ws path as the backend WebSocket server listens on all paths by default
        if (!port || port === '80' || port === '443') {
          wsUrl = `${protocol}//${hostname}`;
        } else {
          wsUrl = `${protocol}//${hostname}:${port}`;
        }
      }

      this.wsUrl = wsUrl;
      await this.connect();

      // Setup visibility change handler
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
          this.handlePageHidden();
        } else {
          this.handlePageVisible();
        }
      });

      // Setup beforeunload
      window.addEventListener('beforeunload', () => {
        this.disconnect();
      });

      console.log('✅ RealtimeManager initialized');
      return true;
    } catch (error) {
      console.error('❌ RealtimeManager init failed:', error);
      return false;
    }
  }

  /**
   * Connect to WebSocket server
   */
  async connect() {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      console.log('Already connected or connecting');
      return;
    }

    this.connectionState = this.reconnectAttempts > 0 ? 'reconnecting' : 'connecting';
    
    try {
      this.ws = new WebSocket(this.wsUrl);
      
      this.ws.onopen = (event) => this.handleOpen(event);
      this.ws.onclose = (event) => this.handleClose(event);
      this.ws.onerror = (event) => this.handleError(event);
      this.ws.onmessage = (event) => this.handleMessage(event);

    } catch (error) {
      console.error('WebSocket connection error:', error);
      this.scheduleReconnect();
    }
  }

  /**
   * Handle WebSocket open event
   */
  handleOpen(event) {
    console.log('🔌 WebSocket connected');
    this.isConnected = true;
    this.connectionState = 'connected';
    this.reconnectAttempts = 0;
    this.reconnectDelay = 1000;

    // Start heartbeat
    this.startHeartbeat();

    // Send queued messages
    this.flushMessageQueue();

    // Register presence
    if (this.config.enablePresence) {
      this.sendPresenceUpdate('online');
    }

    // Notify listeners
    this.emit('connect', { timestamp: Date.now() });

    // Update UI
    if (typeof StateManager !== 'undefined') {
      StateManager.set('realtime.connected', true);
      StateManager.set('realtime.latency', 0);
    }

    // Track in analytics
    if (typeof AIAnalytics !== 'undefined' && typeof AIAnalytics.trackEvent === 'function') {
      AIAnalytics.trackEvent('realtime', 'connected', 'websocket');
    }
  }

  /**
   * Handle WebSocket close event
   */
  handleClose(event) {
    console.log('🔌 WebSocket disconnected:', event.code, event.reason);
    this.isConnected = false;
    this.connectionState = 'disconnected';

    // Stop heartbeat
    this.stopHeartbeat();

    // Notify listeners
    this.emit('disconnect', { 
      code: event.code, 
      reason: event.reason,
      wasClean: event.wasClean 
    });

    // Update UI
    if (typeof StateManager !== 'undefined') {
      StateManager.set('realtime.connected', false);
    }

    // Attempt reconnect if not clean close
    if (!event.wasClean && this.reconnectAttempts < this.maxReconnectAttempts) {
      this.scheduleReconnect();
    }
  }

  /**
   * Handle WebSocket error event
   */
  handleError(event) {
    // WebSocket connection errors are common and expected during page load
    // Don't log on first connection attempt - only log on subsequent attempts
    if (this.reconnectAttempts > 0) {
      console.log(`🔌 WebSocket reconnecting (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
    }
    
    this.stats.errors++;
    
    this.emit('error', { 
      error: event,
      timestamp: Date.now() 
    });

    // Only track in analytics if multiple failures
    if (this.reconnectAttempts >= 3 && typeof AIAnalytics !== 'undefined' && typeof AIAnalytics.track === 'function') {
      AIAnalytics.track('realtime_error', { type: 'connection_error', attempts: this.reconnectAttempts });
    }
  }

  /**
   * Handle incoming WebSocket message
   */
  handleMessage(event) {
    try {
      const data = JSON.parse(event.data);
      this.stats.messagesReceived++;
      this.messageCount++;
      this.eventCount++;

      // Handle different message types
      switch (data.type) {
        case 'pong':
          this.handlePong(data);
          break;
        
        case 'presence':
          this.handlePresenceUpdate(data);
          break;
        
        case 'typing':
          this.handleTypingIndicator(data);
          break;
        
        case 'notification':
          this.handleNotification(data);
          break;
        
        case 'update':
          this.handleUpdate(data);
          break;
        
        case 'broadcast':
          this.handleBroadcast(data);
          break;
        
        default:
          // Emit to specific channel subscribers
          if (data.channel) {
            this.notifySubscribers(data.channel, data);
          }
          
          // Emit to general message listeners
          this.emit('message', data);
      }

    } catch (error) {
      console.error('Error parsing WebSocket message:', error);
    }
  }

  /**
   * Send message through WebSocket
   */
  send(type, data = {}, channel = null) {
    const message = {
      type,
      data,
      channel,
      timestamp: Date.now(),
      clientId: this.getClientId()
    };

    if (this.isConnected && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify(message));
        this.stats.messagesSent++;
        this.messageCount++;
        this.eventCount++;
        return true;
      } catch (error) {
        console.error('Error sending message:', error);
        this.messageQueue.push(message);
        return false;
      }
    } else {
      // Queue message for later
      this.messageQueue.push(message);
      return false;
    }
  }

  /**
   * Subscribe to a channel
   */
  subscribe(channel, callback) {
    if (!this.subscriptions.has(channel)) {
      this.subscriptions.set(channel, new Set());
    }
    
    this.subscriptions.get(channel).add(callback);

    // Send subscription message to server
    this.send('subscribe', { channel });

    // Return unsubscribe function
    return () => this.unsubscribe(channel, callback);
  }

  /**
   * Unsubscribe from a channel
   */
  unsubscribe(channel, callback = null) {
    if (!this.subscriptions.has(channel)) return;

    if (callback) {
      this.subscriptions.get(channel).delete(callback);
      
      // Remove channel if no more subscribers
      if (this.subscriptions.get(channel).size === 0) {
        this.subscriptions.delete(channel);
        this.send('unsubscribe', { channel });
      }
    } else {
      // Unsubscribe all
      this.subscriptions.delete(channel);
      this.send('unsubscribe', { channel });
    }
  }

  /**
   * Notify channel subscribers
   */
  notifySubscribers(channel, data) {
    if (!this.subscriptions.has(channel)) return;

    this.subscriptions.get(channel).forEach(callback => {
      try {
        callback(data);
      } catch (error) {
        console.error(`Error in subscriber callback for ${channel}:`, error);
      }
    });
  }

  /**
   * Broadcast message to all connected clients
   */
  broadcast(eventName, data) {
    this.send('broadcast', { event: eventName, payload: data });
  }

  /**
   * Send presence update
   */
  sendPresenceUpdate(status, metadata = {}) {
    if (!this.config.enablePresence) return;

    this.send('presence', {
      status, // online, away, busy, offline
      metadata: {
        ...metadata,
        page: window.location.pathname,
        timestamp: Date.now()
      }
    });
  }

  /**
   * Handle presence update from server
   */
  handlePresenceUpdate(data) {
    const { userId, status, metadata } = data.data;
    
    this.presenceUsers.set(userId, {
      status,
      metadata,
      lastSeen: Date.now()
    });

    this.emit('presence', { userId, status, metadata });

    // Update state
    if (typeof StateManager !== 'undefined') {
      StateManager.set('realtime.presence', Object.fromEntries(this.presenceUsers));
    }
  }

  /**
   * Send typing indicator
   */
  sendTypingIndicator(channel, isTyping = true) {
    if (!this.config.enableTypingIndicators) return;

    this.send('typing', {
      channel,
      isTyping,
      userId: this.getClientId()
    });
  }

  /**
   * Handle typing indicator
   */
  handleTypingIndicator(data) {
    this.emit('typing', data.data);
  }

  /**
   * Handle notification
   */
  handleNotification(data) {
    const { title, body, icon, actions } = data.data;

    // Show browser notification if permitted
    if ('Notification' in window && Notification.permission === 'granted') {
      const notification = new Notification(title, {
        body,
        icon: icon || '/assets/img/icon-192x192.png',
        badge: '/assets/img/icon-72x72.png',
        tag: data.data.tag || 'realtime-notification',
        data: data.data
      });

      notification.onclick = () => {
        if (data.data.url) {
          window.location.href = data.data.url;
        }
        notification.close();
      };
    }

    // Emit event
    this.emit('notification', data.data);
  }

  /**
   * Handle update (real-time data sync)
   */
  handleUpdate(data) {
    const { entity, action, payload } = data.data;

    // Update local state
    if (typeof StateManager !== 'undefined') {
      switch (action) {
        case 'create':
          StateManager.set(`${entity}.${payload.id}`, payload);
          break;
        case 'update':
          StateManager.update(`${entity}.${payload.id}`, payload);
          break;
        case 'delete':
          StateManager.delete(`${entity}.${payload.id}`);
          break;
      }
    }

    // Invalidate cache
    if (typeof AdvancedCache !== 'undefined') {
      AdvancedCache.invalidate(`/api/${entity}`);
    }

    // Emit event
    this.emit('update', { entity, action, payload });
  }

  /**
   * Handle broadcast message
   */
  handleBroadcast(data) {
    const { event, payload } = data.data;
    
    // Emit to listeners
    this.emit(event, payload);
  }

  /**
   * Start heartbeat
   */
  startHeartbeat() {
    this.stopHeartbeat(); // Clear existing

    this.heartbeatInterval = setInterval(() => {
      if (this.isConnected) {
        this.stats.lastPingTime = Date.now();
        this.send('ping', { timestamp: this.stats.lastPingTime });
      }
    }, this.config.heartbeatInterval);
  }

  /**
   * Stop heartbeat
   */
  stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  /**
   * Handle pong response
   */
  handlePong(data) {
    const latency = Date.now() - this.stats.lastPingTime;
    this.stats.avgLatency = (this.stats.avgLatency * 0.8) + (latency * 0.2); // Moving average

    if (typeof StateManager !== 'undefined') {
      StateManager.set('realtime.latency', Math.round(this.stats.avgLatency));
    }
  }

  /**
   * Flush queued messages
   */
  flushMessageQueue() {
    while (this.messageQueue.length > 0) {
      const message = this.messageQueue.shift();
      try {
        this.ws.send(JSON.stringify(message));
        this.stats.messagesSent++;
      } catch (error) {
        console.error('Error sending queued message:', error);
        // Put it back
        this.messageQueue.unshift(message);
        break;
      }
    }
  }

  /**
   * Schedule reconnect
   */
  scheduleReconnect() {
    this.reconnectAttempts++;
    this.stats.reconnects++;

    const delay = Math.min(
      this.reconnectDelay * Math.pow(this.config.reconnectBackoff, this.reconnectAttempts - 1),
      this.config.maxReconnectDelay
    );

    console.log(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);

    setTimeout(() => {
      if (this.reconnectAttempts <= this.maxReconnectAttempts) {
        this.connect();
      } else {
        console.error('Max reconnect attempts reached');
        if (typeof StateManager !== 'undefined') {
          StateManager.set('realtime.error', 'Max reconnect attempts reached');
        }
      }
    }, delay);
  }

  /**
   * Disconnect WebSocket
   */
  disconnect() {
    if (this.ws) {
      this.stopHeartbeat();
      
      // Send offline presence
      if (this.config.enablePresence) {
        this.sendPresenceUpdate('offline');
      }

      this.ws.close(1000, 'Client disconnect');
      this.ws = null;
      this.isConnected = false;
      this.connectionState = 'disconnected';
    }
  }

  /**
   * Handle page hidden (tab inactive)
   */
  handlePageHidden() {
    if (this.config.enablePresence) {
      this.sendPresenceUpdate('away');
    }
  }

  /**
   * Handle page visible (tab active)
   */
  handlePageVisible() {
    if (this.config.enablePresence) {
      this.sendPresenceUpdate('online');
    }

    // Reconnect if disconnected
    if (!this.isConnected) {
      this.connect();
    }
  }

  /**
   * Get unique client ID
   */
  getClientId() {
    if (!this.clientId) {
      this.clientId = localStorage.getItem('realtime_client_id');
      if (!this.clientId) {
        this.clientId = 'client_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        localStorage.setItem('realtime_client_id', this.clientId);
      }
    }
    return this.clientId;
  }

  /**
   * Add event listener
   */
  on(event, callback) {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(callback);

    // Return unsubscribe function
    return () => this.off(event, callback);
  }

  /**
   * Remove event listener
   */
  off(event, callback) {
    if (!this.listeners[event]) return;
    
    if (callback) {
      this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
    } else {
      this.listeners[event] = [];
    }
  }

  /**
   * Emit event to listeners
   */
  emit(event, data) {
    if (!this.listeners[event]) return;

    this.listeners[event].forEach(callback => {
      try {
        callback(data);
      } catch (error) {
        console.error(`Error in event listener for ${event}:`, error);
      }
    });
  }

  /**
   * Get connection status
   */
  getStatus() {
    return {
      connected: this.isConnected,
      state: this.connectionState,
      latency: Math.round(this.stats.avgLatency),
      reconnectAttempts: this.reconnectAttempts,
      presenceCount: this.presenceUsers.size,
      subscriptions: this.subscriptions.size,
      queuedMessages: this.messageQueue.length
    };
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      ...this.stats,
      avgLatency: Math.round(this.stats.avgLatency),
      uptime: this.isConnected ? Date.now() - this.stats.lastPingTime : 0
    };
  }
}

// Create global instance
window.RealtimeManager = window.RealtimeManager || new RealtimeManager();
window.realtimeManager = window.RealtimeManager;

// Auto-initialize if on client-side
if (typeof window !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    // Initialize with simulated fallback for development
    window.RealtimeManager.init().catch(() => {
      console.log('ℹ️ WebSocket server not available, using simulated mode');
    });
  });
}
