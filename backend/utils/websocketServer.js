/**
 * WebSocket Server for Real-time Features
 * BLACKONN E-Commerce Platform
 */

const WebSocket = require('ws');
const http = require('http');

class WebSocketServer {
  constructor(server) {
    this.wss = new WebSocket.Server({ server });
    this.clients = new Map(); // Map of userId -> WebSocket
    this.rooms = new Map(); // Map of roomId -> Set of WebSockets
    
    this.setupServer();
  }

  setupServer() {
    this.wss.on('connection', (ws, req) => {
      console.log('🔌 New WebSocket connection');

      // Handle initial connection
      ws.on('message', (message) => {
        try {
          const data = JSON.parse(message);
          this.handleMessage(ws, data);
        } catch (error) {
          console.error('❌ WebSocket message error:', error);
          ws.send(JSON.stringify({ type: 'error', message: 'Invalid message format' }));
        }
      });

      // Handle disconnection
      ws.on('close', () => {
        this.handleDisconnect(ws);
      });

      // Send welcome message
      ws.send(JSON.stringify({
        type: 'connected',
        message: 'Connected to BLACKONN Real-time Server',
        timestamp: new Date().toISOString()
      }));
    });
  }

  handleMessage(ws, data) {
    const { type, payload } = data;

    switch (type) {
      case 'authenticate':
        this.handleAuth(ws, payload);
        break;

      case 'join_room':
        this.joinRoom(ws, payload.roomId);
        break;

      case 'leave_room':
        this.leaveRoom(ws, payload.roomId);
        break;

      case 'subscribe':
        this.handleSubscribe(ws, payload);
        break;

      case 'ping':
        ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
        break;

      default:
        ws.send(JSON.stringify({ type: 'error', message: 'Unknown message type' }));
    }
  }

  handleAuth(ws, payload) {
    const { userId, token } = payload;
    
    // TODO: Verify token with your auth system
    // For now, we'll just store the userId
    ws.userId = userId;
    this.clients.set(userId, ws);

    ws.send(JSON.stringify({
      type: 'authenticated',
      userId,
      timestamp: new Date().toISOString()
    }));

    console.log(`✅ User ${userId} authenticated`);
  }

  handleSubscribe(ws, payload) {
    const { events } = payload;
    
    if (!ws.subscriptions) {
      ws.subscriptions = new Set();
    }

    events.forEach(event => ws.subscriptions.add(event));

    ws.send(JSON.stringify({
      type: 'subscribed',
      events,
      timestamp: new Date().toISOString()
    }));
  }

  joinRoom(ws, roomId) {
    if (!this.rooms.has(roomId)) {
      this.rooms.set(roomId, new Set());
    }

    this.rooms.get(roomId).add(ws);
    ws.currentRoom = roomId;

    ws.send(JSON.stringify({
      type: 'room_joined',
      roomId,
      timestamp: new Date().toISOString()
    }));

    console.log(`👥 User joined room: ${roomId}`);
  }

  leaveRoom(ws, roomId) {
    if (this.rooms.has(roomId)) {
      this.rooms.get(roomId).delete(ws);
    }

    ws.send(JSON.stringify({
      type: 'room_left',
      roomId,
      timestamp: new Date().toISOString()
    }));
  }

  handleDisconnect(ws) {
    // Remove from clients
    if (ws.userId) {
      this.clients.delete(ws.userId);
    }

    // Remove from all rooms
    this.rooms.forEach((clients, roomId) => {
      clients.delete(ws);
    });

    console.log('🔌 WebSocket disconnected');
  }

  // Public methods for broadcasting events

  /**
   * Broadcast to all connected clients
   */
  broadcast(event, data) {
    const message = JSON.stringify({ type: event, data, timestamp: new Date().toISOString() });
    
    this.wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        if (!client.subscriptions || client.subscriptions.has(event)) {
          client.send(message);
        }
      }
    });
  }

  /**
   * Send to specific user
   */
  sendToUser(userId, event, data) {
    const client = this.clients.get(userId);
    
    if (client && client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({ type: event, data, timestamp: new Date().toISOString() }));
    }
  }

  /**
   * Broadcast to room
   */
  broadcastToRoom(roomId, event, data) {
    const room = this.rooms.get(roomId);
    
    if (room) {
      const message = JSON.stringify({ type: event, data, timestamp: new Date().toISOString() });
      room.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(message);
        }
      });
    }
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      connectedClients: this.wss.clients.size,
      authenticatedUsers: this.clients.size,
      activeRooms: this.rooms.size
    };
  }
}

// Export for use in Express app
module.exports = WebSocketServer;

// Example usage in your Express server:
/*
const express = require('express');
const http = require('http');
const WebSocketServer = require('./websocketServer');

const app = express();
const server = http.createServer(app);
const wsServer = new WebSocketServer(server);

// Make wsServer available to routes
app.set('wsServer', wsServer);

// Example: Broadcast new order to admin
app.post('/api/orders', (req, res) => {
  // ... create order logic
  
  const wsServer = req.app.get('wsServer');
  wsServer.broadcast('new_order', {
    orderId: order.id,
    total: order.total
  });
  
  res.json({ success: true, order });
});

// Example: Send notification to specific user
app.post('/api/notify-user', (req, res) => {
  const { userId, message } = req.body;
  const wsServer = req.app.get('wsServer');
  
  wsServer.sendToUser(userId, 'notification', { message });
  
  res.json({ success: true });
});

server.listen(3000, () => {
  console.log('Server running on port 3000');
});
*/
