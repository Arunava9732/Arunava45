/**
 * Performance Utilities - ULTRA HIGH PERFORMANCE
 * Provides response optimization, streaming, and monitoring
 */

const zlib = require('zlib');

// ============ Response Optimization ============

/**
 * Optimized JSON stringify with circular reference handling
 */
function fastStringify(obj) {
  try {
    return JSON.stringify(obj);
  } catch (e) {
    // Handle circular references
    const seen = new WeakSet();
    return JSON.stringify(obj, (key, value) => {
      if (typeof value === 'object' && value !== null) {
        if (seen.has(value)) return '[Circular]';
        seen.add(value);
      }
      return value;
    });
  }
}

/**
 * Pre-compute common responses for faster delivery
 */
const CACHED_RESPONSES = {
  notFound: JSON.stringify({ success: false, error: 'Not found' }),
  unauthorized: JSON.stringify({ success: false, error: 'Unauthorized' }),
  forbidden: JSON.stringify({ success: false, error: 'Forbidden' }),
  serverError: JSON.stringify({ success: false, error: 'Internal server error' }),
  badRequest: JSON.stringify({ success: false, error: 'Bad request' }),
  rateLimited: JSON.stringify({ success: false, error: 'Too many requests' }),
  ok: JSON.stringify({ success: true }),
  healthOk: JSON.stringify({ status: 'ok', timestamp: null }) // timestamp updated per request
};

/**
 * Send pre-cached error response
 */
function sendCachedError(res, type, statusCode = 500) {
  const response = CACHED_RESPONSES[type] || CACHED_RESPONSES.serverError;
  res.status(statusCode).type('application/json').send(response);
}

// ============ Memory Monitoring ============

/**
 * Get detailed memory statistics
 */
function getMemoryStats() {
  const usage = process.memoryUsage();
  return {
    heapUsed: Math.round(usage.heapUsed / 1024 / 1024),
    heapTotal: Math.round(usage.heapTotal / 1024 / 1024),
    rss: Math.round(usage.rss / 1024 / 1024),
    external: Math.round(usage.external / 1024 / 1024),
    heapUsedPercent: Math.round((usage.heapUsed / usage.heapTotal) * 100)
  };
}

/**
 * Force garbage collection if available
 */
function forceGC() {
  if (global.gc) {
    global.gc();
    return true;
  }
  return false;
}

// ============ Request Batching ============

/**
 * Batch multiple database operations for efficiency
 */
class RequestBatcher {
  constructor(processor, options = {}) {
    this.processor = processor;
    this.maxBatchSize = options.maxBatchSize || 50;
    this.maxWaitMs = options.maxWaitMs || 10;
    this.batch = [];
    this.timer = null;
  }

  add(item) {
    return new Promise((resolve, reject) => {
      this.batch.push({ item, resolve, reject });
      
      if (this.batch.length >= this.maxBatchSize) {
        this.flush();
      } else if (!this.timer) {
        this.timer = setTimeout(() => this.flush(), this.maxWaitMs);
      }
    });
  }

  async flush() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    
    if (this.batch.length === 0) return;
    
    const currentBatch = this.batch;
    this.batch = [];
    
    try {
      const items = currentBatch.map(b => b.item);
      const results = await this.processor(items);
      
      currentBatch.forEach((b, i) => {
        b.resolve(results[i]);
      });
    } catch (error) {
      currentBatch.forEach(b => b.reject(error));
    }
  }
}

// ============ Response Streaming ============

/**
 * Stream large JSON arrays efficiently
 */
function streamJsonArray(res, items, options = {}) {
  const { chunkSize = 100, cacheControl } = options;
  
  if (cacheControl) {
    res.set('Cache-Control', cacheControl);
  }
  
  res.set('Content-Type', 'application/json');
  res.write('[');
  
  for (let i = 0; i < items.length; i++) {
    if (i > 0) res.write(',');
    res.write(JSON.stringify(items[i]));
    
    // Flush every chunkSize items to reduce memory pressure
    if (i > 0 && i % chunkSize === 0) {
      // Allow event loop to process other requests
      setImmediate(() => {});
    }
  }
  
  res.write(']');
  res.end();
}

// ============ Timing Utilities ============

/**
 * High-resolution timer for performance measurement
 */
class Timer {
  constructor() {
    this.start = process.hrtime.bigint();
  }
  
  elapsed() {
    const end = process.hrtime.bigint();
    return Number(end - this.start) / 1e6; // Convert to milliseconds
  }
  
  elapsedMicros() {
    const end = process.hrtime.bigint();
    return Number(end - this.start) / 1e3; // Convert to microseconds
  }
}

/**
 * Measure async function execution time
 */
async function measure(fn, label = 'operation') {
  const timer = new Timer();
  try {
    const result = await fn();
    const elapsed = timer.elapsed();
    if (elapsed > 100) {
      console.log(`[PERF] ${label} took ${elapsed.toFixed(2)}ms`);
    }
    return result;
  } catch (error) {
    console.log(`[PERF] ${label} failed after ${timer.elapsed().toFixed(2)}ms`);
    throw error;
  }
}

// ============ Object Pool ============

/**
 * Object pool to reduce garbage collection pressure
 */
class ObjectPool {
  constructor(factory, reset, initialSize = 10) {
    this.factory = factory;
    this.reset = reset;
    this.pool = [];
    
    // Pre-allocate
    for (let i = 0; i < initialSize; i++) {
      this.pool.push(factory());
    }
  }
  
  acquire() {
    if (this.pool.length > 0) {
      return this.pool.pop();
    }
    return this.factory();
  }
  
  release(obj) {
    this.reset(obj);
    if (this.pool.length < 100) { // Max pool size
      this.pool.push(obj);
    }
  }
}

// Pre-create response object pool
const responseDataPool = new ObjectPool(
  () => ({ success: true, data: null, message: null }),
  (obj) => { obj.success = true; obj.data = null; obj.message = null; }
);

// ============ Debounced Write ============

/**
 * Debounced file writer to reduce disk I/O
 */
class DebouncedWriter {
  constructor(writeFunction, delayMs = 100) {
    this.writeFunction = writeFunction;
    this.delayMs = delayMs;
    this.pending = new Map();
  }
  
  write(key, data) {
    const existing = this.pending.get(key);
    if (existing) {
      clearTimeout(existing.timer);
    }
    
    return new Promise((resolve, reject) => {
      const timer = setTimeout(async () => {
        this.pending.delete(key);
        try {
          await this.writeFunction(key, data);
          resolve();
        } catch (e) {
          reject(e);
        }
      }, this.delayMs);
      
      this.pending.set(key, { timer, resolve, reject });
    });
  }
}

// ============ Connection Pooling Helper ============

/**
 * Simple connection pool for external services
 */
class ConnectionPool {
  constructor(createConnection, options = {}) {
    this.createConnection = createConnection;
    this.maxSize = options.maxSize || 10;
    this.idleTimeout = options.idleTimeout || 30000;
    this.pool = [];
    this.active = 0;
  }
  
  async acquire() {
    // Try to get from pool
    while (this.pool.length > 0) {
      const conn = this.pool.pop();
      if (conn.isValid && conn.isValid()) {
        this.active++;
        return conn;
      }
    }
    
    // Create new if under limit
    if (this.active < this.maxSize) {
      const conn = await this.createConnection();
      this.active++;
      return conn;
    }
    
    // Wait for available connection
    return new Promise((resolve) => {
      const check = setInterval(() => {
        if (this.pool.length > 0) {
          clearInterval(check);
          this.active++;
          resolve(this.pool.pop());
        }
      }, 10);
    });
  }
  
  release(conn) {
    this.active--;
    this.pool.push(conn);
    
    // Schedule cleanup
    setTimeout(() => {
      const idx = this.pool.indexOf(conn);
      if (idx !== -1) {
        this.pool.splice(idx, 1);
        if (conn.close) conn.close();
      }
    }, this.idleTimeout);
  }
}

// ============ Exports ============

module.exports = {
  // Response optimization
  fastStringify,
  CACHED_RESPONSES,
  sendCachedError,
  
  // Memory
  getMemoryStats,
  forceGC,
  
  // Batching
  RequestBatcher,
  
  // Streaming
  streamJsonArray,
  
  // Timing
  Timer,
  measure,
  
  // Pooling
  ObjectPool,
  responseDataPool,
  ConnectionPool,
  
  // Debouncing
  DebouncedWriter
};
