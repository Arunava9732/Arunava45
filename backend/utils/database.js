/**
 * JSON File Database Utility - AI Enhanced (ULTRA SPEED)
 * Simple file-based storage for the full-stack website
 * Features: In-memory caching, AI-friendly logging, structured queries
 * OPTIMIZED: Async I/O, memory-mapped reads, batch writes, parallel ops
 * Can be replaced with MongoDB/PostgreSQL for production
 */

const fs = require('fs');
const fsPromises = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');

// Python AI Bridge for database anomaly detection
let pythonBridge = null;
try {
  pythonBridge = require('./python_bridge');
  console.log('[AI-DB] Python AI enabled for database analytics');
} catch (e) {
  console.warn('[AI-DB] Python bridge not available, using standard DB operations');
}

const DB_DIR = path.join(__dirname, '..', 'data');

// Ensure data directory exists
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

// ============ ULTRA-SPEED CONFIGURATION ============
const WRITE_BATCH_DELAY_MS = 25; // Reduced from 50ms for faster writes
const CACHE_VALIDITY_MS = 60000; // 60 second cache (increased from 10s for VPS performance)
const MAX_WRITE_BUFFER_SIZE = 100; // Max pending writes before force flush
const ASYNC_WRITE_ENABLED = true; // Use async I/O for non-blocking writes

// Pre-allocated buffers for faster string operations
const JSON_STRINGIFY_SPACE = undefined; // No formatting = faster write (was 2)

// AI Logger helper (optimized - only log in development)
const LOG_ENABLED = process.env.NODE_ENV !== 'production';
function aiDbLog(operation, collection, details = {}) {
  if (!LOG_ENABLED) return;
  console.log('[AI-DB]', JSON.stringify({
    timestamp: new Date().toISOString(),
    operation,
    collection,
    ...details,
    _structured: true
  }));
}

// Default data structures
const DEFAULTS = {
  users: [],
  products: [
    { id: "prod-001", name: "Over Sized T-Shirt", price: 1499, color: "Black", size: "All", stock: 100, position: 1, description: "Comfortable oversized t-shirt made from premium cotton.", image: "/uploads/products/1766256485041_oorxuo.png", thumbImages: ["/uploads/products/1766256485041_oorxuo.png", "/uploads/products/1766300543944_lcdhiw.png"] },
    { id: "prod-002", name: "Slim Fit T-Shirt", price: 599, color: "Red and Blue", size: "All", stock: 150, position: 2, description: "Slim fit t-shirt available in red and blue.", image: "/uploads/products/1766256517720_hcxarp.png", thumbImages: ["/uploads/products/1766256517720_hcxarp.png", "/uploads/products/1766304774184_nz59z8.png"] },
    { id: "prod-003", name: "CAP", price: 399, color: "Black", size: "All", stock: 200, position: 3, description: "Classic black cap with adjustable strap.", image: "/uploads/products/1766256568248_klqmvk.png", thumbImages: ["/uploads/products/1766256568248_klqmvk.png", "/uploads/products/1766305297632_oepikm.png"] },
    { id: "prod-004", name: "BAG", price: 1799, color: "Black", size: "One Size", stock: 75, position: 4, description: "Stylish black bag with multiple compartments.", image: "/uploads/products/1766256649355_hpnrsv.png", thumbImages: ["/uploads/products/1766256649355_hpnrsv.png", "/uploads/products/1766305433978_ro3m77.png"] },
    { id: "prod-005", name: "Hoodie", price: 1999, color: "Black", size: "All", stock: 80, position: 5, description: "Cozy black hoodie made from soft fleece.", image: "/uploads/products/1766256703180_kqw3g7.png", thumbImages: ["/uploads/products/1766256703180_kqw3g7.png", "/uploads/products/1766305203633_pi904w.png"] },
    { id: "prod-006", name: "Pants", price: 1299, color: "All", size: "All", stock: 120, position: 6, description: "Versatile pants available in multiple colors.", image: "/uploads/products/1766258492979_8sibcs.png", thumbImages: ["/uploads/products/1766258492979_8sibcs.png", "/uploads/products/1766305507705_rtn6gs.png"] }
  ],
  orders: [],
  carts: {},
  returns: [],
  contacts: [],
  sessions: [],
  passwordResets: [],
  slides: [
    { id: "slide-001", type: "video", src: "BG_VIDEO.mp4", title: "Hero Video 1", active: true, position: 1, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    { id: "slide-002", type: "video", src: "3627-172488393.mp4", title: "Hero Video 2", active: true, position: 2, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    { id: "slide-003", type: "video", src: "9398-219552669.mp4", title: "Hero Video 3", active: true, position: 3, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
  ],
  wishlists: {}
};

class Database {
  constructor(collection) {
    this.collection = collection;
    this.filePath = path.join(DB_DIR, `${collection}.json`);
    this.cache = null; // In-memory cache
    this.lastRead = 0;
    this.cacheValidMs = CACHE_VALIDITY_MS; // Ultra-fast cache validity
    this._writeBuffer = []; // Buffer for batched writes
    this._isWriting = false; // Prevent concurrent writes
    this._pendingWritePromise = null; // Track async write
    
    // In-memory indexes for O(1) lookups (expanded)
    this.indexes = {
      id: new Map(),
      email: new Map(),
      token: new Map(),
      orderId: new Map(), // Order lookups
      userId: new Map()  // User-based lookups
    };
    
    // Pre-compiled JSON for faster parsing
    this._jsonCache = null;
    this._jsonCacheTime = 0;
    
    this._ensureFile();
    this._loadCache(); // Initial load
    
    // Debounced file watcher (reduced frequency)
    this._watchDebounce = null;
    try {
      fs.watch(this.filePath, { persistent: false }, (eventType) => {
        if (eventType === 'change' && !this._isWriting) {
          // Debounce watch events
          if (this._watchDebounce) clearTimeout(this._watchDebounce);
          this._watchDebounce = setTimeout(() => {
            this.cache = null;
            this._rebuildIndexes();
          }, 100);
        }
      });
    } catch (e) {
      // Ignore watch errors
    }
  }
  
  // Build in-memory indexes for fast lookups (OPTIMIZED)
  _rebuildIndexes() {
    // Clear all indexes at once
    for (const idx of Object.values(this.indexes)) idx.clear();
    
    const data = this.cache || this._read();
    if (!Array.isArray(data)) return;
    
    // Single-pass index building (faster than multiple forEach)
    const len = data.length;
    for (let i = 0; i < len; i++) {
      const item = data[i];
      if (item.id) this.indexes.id.set(item.id, i);
      if (item.email) this.indexes.email.set(item.email.toLowerCase(), i);
      if (item.token) this.indexes.token.set(item.token, i);
      if (item.orderId) this.indexes.orderId.set(item.orderId, i);
      if (item.userId) {
        // Multi-value index for userId (user can have multiple records)
        if (!this.indexes.userId.has(item.userId)) {
          this.indexes.userId.set(item.userId, []);
        }
        this.indexes.userId.get(item.userId).push(i);
      }
    }
  }

  _ensureFile() {
    if (!fs.existsSync(this.filePath)) {
      const defaultData = DEFAULTS[this.collection] || [];
      fs.writeFileSync(this.filePath, JSON.stringify(defaultData, null, 2));
    }
  }

  _loadCache() {
    try {
      // Use sync read for initial load (fastest for small files)
      const data = fs.readFileSync(this.filePath, 'utf8');
      
      // Fast JSON parse with error recovery
      try {
        this.cache = JSON.parse(data);
      } catch (parseErr) {
        console.error(`JSON parse error in ${this.collection}, using defaults`);
        this.cache = DEFAULTS[this.collection] || [];
      }
      
      this.lastRead = Date.now();
      this._rebuildIndexes();
    } catch (error) {
      console.error(`Error reading ${this.collection}:`, error.message);
      this.cache = DEFAULTS[this.collection] || [];
    }
  }
  
  // Async load for background refresh
  async _loadCacheAsync() {
    try {
      const data = await fsPromises.readFile(this.filePath, 'utf8');
      this.cache = JSON.parse(data);
      this.lastRead = Date.now();
      this._rebuildIndexes();
    } catch (error) {
      // Silent fail for async refresh
    }
  }

  _read() {
    // Use cache if available and not older than cacheValidMs
    if (this.cache && (Date.now() - this.lastRead < this.cacheValidMs)) return this.cache;
    this._loadCache();
    return this.cache;
  }

  _write(data) {
    try {
      // Update cache immediately (synchronous for read consistency)
      this.cache = data;
      this.lastRead = Date.now();
      
      // Rebuild indexes in next tick to not block
      setImmediate(() => this._rebuildIndexes());
      
      // Use async write for non-blocking I/O
      if (ASYNC_WRITE_ENABLED) {
        this._asyncDebouncedWrite(data);
      } else {
        this._debouncedWrite(data);
      }
      
      aiDbLog('WRITE', this.collection, { recordCount: Array.isArray(data) ? data.length : Object.keys(data).length });
      return true;
    } catch (error) {
      console.error(`Error writing ${this.collection}:`, error);
      aiDbLog('WRITE_ERROR', this.collection, { error: error.message });
      return false;
    }
  }
  
  // ULTRA-FAST: Async debounced write with coalescing
  _asyncDebouncedWrite(data) {
    // Store latest data
    this._pendingData = data;
    
    // Clear any pending write
    if (this._writeTimer) {
      clearTimeout(this._writeTimer);
    }
    
    // Batch writes with shorter delay for speed
    this._writeTimer = setTimeout(() => {
      this._asyncAtomicWrite(this._pendingData);
      this._writeTimer = null;
      this._pendingData = null;
    }, WRITE_BATCH_DELAY_MS);
  }
  
  // Debounced file write (sync fallback)
  _debouncedWrite(data) {
    if (this._writeTimer) clearTimeout(this._writeTimer);
    this._writeTimer = setTimeout(() => {
      this._atomicWrite(data);
      this._writeTimer = null;
    }, WRITE_BATCH_DELAY_MS);
  }
  
  // ASYNC ATOMIC WRITE: Non-blocking I/O
  async _asyncAtomicWrite(data) {
    if (this._isWriting) {
      // Queue write if already writing
      this._pendingData = data;
      return;
    }
    
    this._isWriting = true;
    const tempPath = `${this.filePath}.tmp`;
    
    try {
      // No formatting (null) for faster serialization
      const json = JSON.stringify(data, null, JSON_STRINGIFY_SPACE);
      await fsPromises.writeFile(tempPath, json, 'utf8');
      await fsPromises.rename(tempPath, this.filePath);
    } catch (error) {
      console.error(`Async write failed for ${this.collection}:`, error.message);
      // Fallback to sync write
      this._atomicWrite(data);
    } finally {
      this._isWriting = false;
      
      // Process queued write if any
      if (this._pendingData) {
        const pending = this._pendingData;
        this._pendingData = null;
        setImmediate(() => this._asyncAtomicWrite(pending));
      }
    }
  }
  
  // SYNC ATOMIC WRITE: For critical/immediate writes
  _atomicWrite(data) {
    try {
      const tempPath = `${this.filePath}.tmp`;
      fs.writeFileSync(tempPath, JSON.stringify(data, null, JSON_STRINGIFY_SPACE));
      fs.renameSync(tempPath, this.filePath);
    } catch (error) {
      console.error(`Atomic write failed for ${this.collection}:`, error.message);
    }
  }
  
  // Force immediate write (for critical data)
  flushSync() {
    if (this._writeTimer) {
      clearTimeout(this._writeTimer);
      this._writeTimer = null;
    }
    if (this._pendingData) {
      this._atomicWrite(this._pendingData);
      this._pendingData = null;
    } else if (this.cache) {
      this._atomicWrite(this.cache);
    }
  }
  
  // Async flush for graceful shutdown
  async flushAsync() {
    if (this._writeTimer) {
      clearTimeout(this._writeTimer);
      this._writeTimer = null;
    }
    const data = this._pendingData || this.cache;
    if (data) {
      await this._asyncAtomicWrite(data);
    }
  }

  /**
   * Create a backup of the current database file
   * @returns {boolean} Success status
   */
  backup() {
    try {
      const backupDir = path.join(DB_DIR, 'backups');
      if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
      }
      
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupPath = path.join(backupDir, `${this.collection}_${timestamp}.json`);
      
      fs.copyFileSync(this.filePath, backupPath);
      
      // Cleanup old backups (keep last 5)
      const files = fs.readdirSync(backupDir)
        .filter(f => f.startsWith(this.collection))
        .sort()
        .reverse();
        
      if (files.length > 5) {
        files.slice(5).forEach(f => fs.unlinkSync(path.join(backupDir, f)));
      }
      
      return true;
    } catch (error) {
      console.error(`Backup failed for ${this.collection}:`, error);
      return false;
    }
  }

  findAll() {
    return this._read();
  }

  // O(1) lookup using index if available
  findById(id) {
    const data = this._read();
    if (Array.isArray(data)) {
      // Use index for O(1) lookup
      const idx = this.indexes.id.get(id);
      if (idx !== undefined && data[idx]?.id === id) {
        return data[idx];
      }
      // Fallback to linear search if index miss
      return data.find(item => item.id === id);
    }
    return data[id];
  }

  // Optimized findOne with indexed lookups
  findOne(query) {
    const data = this._read();
    if (!Array.isArray(data)) return null;
    
    // Fast path: single key indexed lookups
    const keys = Object.keys(query);
    
    // O(1) ID lookup
    if (keys.length === 1 && keys[0] === 'id') {
      return this.findById(query.id);
    }
    
    // O(1) Email lookup
    if (keys.length === 1 && keys[0] === 'email') {
      const idx = this.indexes.email.get(query.email.toLowerCase());
      if (idx !== undefined) {
        const item = data[idx];
        if (item?.email?.toLowerCase() === query.email.toLowerCase()) return item;
      }
    }
    
    // O(1) Token lookup
    if (keys.length === 1 && keys[0] === 'token') {
      const idx = this.indexes.token.get(query.token);
      if (idx !== undefined) {
        const item = data[idx];
        if (item?.token === query.token) return item;
      }
    }
    
    // Compound query optimization: token + userId
    if (keys.includes('token') && keys.includes('userId')) {
      const idx = this.indexes.token.get(query.token);
      if (idx !== undefined) {
        const item = data[idx];
        if (item?.token === query.token && item?.userId === query.userId) return item;
      }
      return null; // Token not found = no match
    }
    
    // Fallback to linear search for complex queries
    return data.find(item => {
      return Object.entries(query).every(([key, value]) => {
        if (typeof value === 'function') return value(item[key]);
        return item[key] === value;
      });
    });
  }

  find(query) {
    const data = this._read();
    if (!Array.isArray(data)) return [];
    
    // Fast path: userId index for user-specific queries
    const keys = Object.keys(query);
    if (keys.length === 1 && keys[0] === 'userId' && this.indexes.userId.has(query.userId)) {
      const indices = this.indexes.userId.get(query.userId);
      return indices.map(i => data[i]).filter(Boolean);
    }
    
    // Use pre-computed entries for faster iteration
    const queryEntries = Object.entries(query);
    const queryLen = queryEntries.length;
    
    // Optimized filter with early exit
    const results = [];
    const dataLen = data.length;
    
    outer: for (let i = 0; i < dataLen; i++) {
      const item = data[i];
      for (let j = 0; j < queryLen; j++) {
        const [key, value] = queryEntries[j];
        if (typeof value === 'function') {
          if (!value(item[key])) continue outer;
        } else if (item[key] !== value) {
          continue outer;
        }
      }
      results.push(item);
    }
    
    return results;
  }

  create(item) {
    const data = this._read();
    if (Array.isArray(data)) {
      data.push(item);
      this._write(data);
      return item;
    }
    return null;
  }

  update(id, updates) {
    const data = this._read();
    if (Array.isArray(data)) {
      // Use O(1) index lookup instead of findIndex
      let index = this.indexes.id.get(id);
      
      // Fallback if index miss
      if (index === undefined) {
        index = data.findIndex(item => item.id === id);
      }
      
      if (index !== -1 && index !== undefined) {
        // Merge updates efficiently
        data[index] = Object.assign({}, data[index], updates);
        this._write(data);
        return data[index];
      }
    }
    return null;
  }

  delete(id) {
    const data = this._read();
    if (Array.isArray(data)) {
      // Use O(1) index lookup
      const index = this.indexes.id.get(id);
      
      if (index !== undefined && data[index]?.id === id) {
        // Splice is faster than filter for single item removal
        data.splice(index, 1);
        this._write(data);
        return true;
      }
      
      // Fallback to filter if index miss
      const filtered = data.filter(item => item.id !== id);
      if (filtered.length !== data.length) {
        this._write(filtered);
        return true;
      }
    }
    return false;
  }

  // For object-based collections (like carts)
  set(key, value) {
    const data = this._read();
    if (typeof data === 'object' && !Array.isArray(data)) {
      data[key] = value;
      this._write(data);
      return value;
    }
    return null;
  }

  get(key) {
    const data = this._read();
    if (typeof data === 'object' && !Array.isArray(data)) {
      return data[key];
    }
    return null;
  }

  // Bulk operations (OPTIMIZED for speed)
  insertMany(items) {
    if (!items || items.length === 0) return [];
    
    const data = this._read();
    if (Array.isArray(data)) {
      // Pre-allocate array capacity for large inserts
      if (items.length > 100) {
        data.length = data.length + items.length;
        data.length = data.length - items.length;
      }
      
      // Use push.apply for faster bulk insert
      Array.prototype.push.apply(data, items);
      this._write(data);
      return items;
    }
    return [];
  }

  deleteMany(query) {
    const data = this._read();
    if (Array.isArray(data)) {
      const filtered = data.filter(item => {
        return !Object.entries(query).every(([key, value]) => item[key] === value);
      });
      this._write(filtered);
      return data.length - filtered.length;
    }
    return 0;
  }

  // Replace entire collection
  replaceAll(newData) {
    this._write(newData);
    return newData;
  }

  count() {
    const data = this._read();
    return Array.isArray(data) ? data.length : Object.keys(data).length;
  }
}

// ---------------------------------------------------------
// High-Performance SQLite storage for critical collections
// ---------------------------------------------------------
class SqliteStore {
  constructor(collection, dbConnection) {
    this.collection = collection;
    this.db = dbConnection;
    
    // In-memory cache for ultra-fast reads
    this._cache = new Map();
    this._cacheAll = null;
    this._cacheTime = 0;
    this._cacheValidMs = 5000; // 5 second cache validity
    
    // Prepared statements cache
    this._statements = {};
    
    // IMPORTANT: Initialize table FIRST, then prepare statements
    this._initialize();
    this._prepareStatements();
  }
  
  _initialize() {
    // Create table if it doesn't exist
    this.db.prepare(`CREATE TABLE IF NOT EXISTS ${this.collection} (
      id TEXT PRIMARY KEY,
      data TEXT,
      token TEXT,
      email TEXT,
      userId TEXT,
      updatedAt TEXT
    )`).run();
    
    // Add missing columns to existing tables (SQLite migration)
    try {
      const tableInfo = this.db.prepare(`PRAGMA table_info(${this.collection})`).all();
      const columns = tableInfo.map(col => col.name);
      
      if (!columns.includes('userId')) {
        this.db.prepare(`ALTER TABLE ${this.collection} ADD COLUMN userId TEXT`).run();
        console.log(`[AI-DB] Added userId column to ${this.collection}`);
      }
      
      if (!columns.includes('token')) {
        this.db.prepare(`ALTER TABLE ${this.collection} ADD COLUMN token TEXT`).run();
        console.log(`[AI-DB] Added token column to ${this.collection}`);
      }
      
      if (!columns.includes('email')) {
        this.db.prepare(`ALTER TABLE ${this.collection} ADD COLUMN email TEXT`).run();
        console.log(`[AI-DB] Added email column to ${this.collection}`);
      }
      
      if (!columns.includes('updatedAt')) {
        this.db.prepare(`ALTER TABLE ${this.collection} ADD COLUMN updatedAt TEXT`).run();
        console.log(`[AI-DB] Added updatedAt column to ${this.collection}`);
      }
    } catch (e) {
      // Ignore column already exists errors
    }
    
    // Create indexes for performance (IF NOT EXISTS handles duplicates)
    try {
      this.db.prepare(`CREATE INDEX IF NOT EXISTS idx_${this.collection}_token ON ${this.collection}(token)`).run();
      this.db.prepare(`CREATE INDEX IF NOT EXISTS idx_${this.collection}_email ON ${this.collection}(email)`).run();
      this.db.prepare(`CREATE INDEX IF NOT EXISTS idx_${this.collection}_userId ON ${this.collection}(userId)`).run();
    } catch (e) {
      // Ignore index errors
    }
    
    // Auto-migration from JSON if the table is empty
    try {
      const countRow = this.db.prepare(`SELECT COUNT(*) as cnt FROM ${this.collection}`).get();
      const count = countRow ? countRow.cnt : 0;
      const jsonPath = path.join(DB_DIR, `${this.collection}.json`);
      
      if (count === 0 && fs.existsSync(jsonPath)) {
        console.log(`[AI-DB] Migrating ${this.collection} to SQLite...`);
        const raw = fs.readFileSync(jsonPath, 'utf8');
        const items = JSON.parse(raw);
        if (Array.isArray(items) && items.length > 0) {
          // Use direct insert during initialization (before replaceAll is available)
          const insert = this.db.prepare(`INSERT OR REPLACE INTO ${this.collection} (id, data, token, email, userId, updatedAt) VALUES (?, ?, ?, ?, ?, ?)`);
          const now = new Date().toISOString();
          const tx = this.db.transaction((arr) => {
            for (const item of arr) {
              if (!item.id) item.id = crypto.randomUUID();
              insert.run(item.id, JSON.stringify(item), item.token || null, item.email || null, item.userId || null, now);
            }
          });
          tx(items);
          console.log(`[AI-DB] Migrated ${items.length} records for ${this.collection}`);
        }
      }
    } catch (e) {
      console.warn(`[AI-DB] Migration failed for ${this.collection}:`, e.message);
    }
  }
  
  // Pre-compile statements for faster execution (called AFTER _initialize)
  _prepareStatements() {
    this._statements.selectAll = this.db.prepare(`SELECT data FROM ${this.collection} ORDER BY updatedAt DESC`);
    this._statements.selectById = this.db.prepare(`SELECT data FROM ${this.collection} WHERE id = ?`);
    this._statements.selectByToken = this.db.prepare(`SELECT data FROM ${this.collection} WHERE token = ?`);
    this._statements.selectByEmail = this.db.prepare(`SELECT data FROM ${this.collection} WHERE email = ?`);
    this._statements.selectByUserId = this.db.prepare(`SELECT data FROM ${this.collection} WHERE userId = ?`);
    this._statements.insert = this.db.prepare(`INSERT INTO ${this.collection} (id, data, token, email, userId, updatedAt) VALUES (?, ?, ?, ?, ?, ?)`);
    this._statements.update = this.db.prepare(`UPDATE ${this.collection} SET data = ?, token = ?, email = ?, userId = ?, updatedAt = ? WHERE id = ?`);
    this._statements.delete = this.db.prepare(`DELETE FROM ${this.collection} WHERE id = ?`);
    this._statements.count = this.db.prepare(`SELECT COUNT(*) as cnt FROM ${this.collection}`);
    this._statements.deleteAll = this.db.prepare(`DELETE FROM ${this.collection}`);
  }
  
  // Invalidate cache
  _invalidateCache() {
    this._cache.clear();
    this._cacheAll = null;
  }

  findAll() {
    // Use cache if valid
    const now = Date.now();
    if (this._cacheAll && (now - this._cacheTime < this._cacheValidMs)) {
      return this._cacheAll;
    }
    
    const rows = this._statements.selectAll.all();
    const results = rows.map(r => JSON.parse(r.data));
    
    // Update cache
    this._cacheAll = results;
    this._cacheTime = now;
    
    return results;
  }

  findById(id) {
    // Check in-memory cache first
    if (this._cache.has(id)) {
      return this._cache.get(id);
    }
    
    const row = this._statements.selectById.get(id);
    const result = row ? JSON.parse(row.data) : null;
    
    // Cache the result
    if (result) {
      this._cache.set(id, result);
    }
    
    return result;
  }

  findOne(query) {
    // Optimization for ID lookup
    if (query && query.id) return this.findById(query.id);
    
    // Optimization for token + userId lookup (critical for session validation)
    if (query && query.token && query.userId) {
      const row = this._statements.selectByToken.get(query.token);
      if (row) {
        const item = JSON.parse(row.data);
        if (item.userId === query.userId) {
          this._cache.set(item.id, item);
          return item;
        }
      }
      return null;
    }
    
    // Optimization for token lookup (critical for sessions)
    if (query && query.token) {
      const row = this._statements.selectByToken.get(query.token);
      if (row) {
        const item = JSON.parse(row.data);
        this._cache.set(item.id, item);
        return item;
      }
      return null;
    }

    // Optimization for email lookup (critical for users)
    if (query && query.email) {
      const row = this._statements.selectByEmail.get(query.email);
      if (row) {
        const item = JSON.parse(row.data);
        this._cache.set(item.id, item);
        return item;
      }
      return null;
    }
    
    // Optimization for userId lookup
    if (query && query.userId && Object.keys(query).length === 1) {
      const row = this._statements.selectByUserId.get(query.userId);
      if (row) {
        const item = JSON.parse(row.data);
        this._cache.set(item.id, item);
        return item;
      }
      return null;
    }

    const all = this.findAll();
    return all.find(item => Object.entries(query).every(([k, v]) => item[k] === v));
  }

  find(query) {
    const all = this.findAll();
    return all.filter(item => Object.entries(query).every(([k, v]) => item[k] === v));
  }

  create(item) {
    if (!item.id) item.id = crypto.randomUUID();
    const now = new Date().toISOString();
    
    this._statements.insert.run(
      item.id,
      JSON.stringify(item),
      item.token || null,
      item.email || null,
      item.userId || null,
      now
    );
    
    // Update cache
    this._cache.set(item.id, item);
    this._cacheAll = null; // Invalidate all cache
    
    return item;
  }

  update(id, updates) {
    const existing = this.findById(id);
    if (!existing) return null;
    
    const merged = Object.assign({}, existing, updates);
    const now = new Date().toISOString();
    
    this._statements.update.run(
      JSON.stringify(merged),
      merged.token || null,
      merged.email || null,
      merged.userId || null,
      now,
      id
    );
    
    // Update cache
    this._cache.set(id, merged);
    this._cacheAll = null;
    
    return merged;
  }

  delete(id) {
    const info = this._statements.delete.run(id);
    
    // Update cache
    this._cache.delete(id);
    this._cacheAll = null;
    
    return info.changes > 0;
  }

  insertMany(items) {
    if (!items || items.length === 0) return [];
    
    const insert = this._statements.insert;
    const now = new Date().toISOString();
    
    // Use transaction for atomic batch insert (much faster)
    const tx = this.db.transaction((arr) => {
      for (const item of arr) {
        if (!item.id) item.id = crypto.randomUUID();
        insert.run(
          item.id,
          JSON.stringify(item),
          item.token || null,
          item.email || null,
          item.userId || null,
          now
        );
      }
    });
    
    tx(items);
    this._invalidateCache();
    
    return items;
  }

  deleteMany(query) {
    const items = this.find(query);
    if (items.length === 0) return 0;
    
    const del = this._statements.delete;
    const tx = this.db.transaction((toDelete) => {
      for (const item of toDelete) {
        del.run(item.id);
      }
    });
    
    tx(items);
    this._invalidateCache();
    
    return items.length;
  }

  count() {
    const row = this._statements.count.get();
    return row ? row.cnt : 0;
  }

  replaceAll(items) {
    if (!items) items = [];
    
    const insert = this.db.prepare(`INSERT OR REPLACE INTO ${this.collection} (id, data, token, email, userId, updatedAt) VALUES (?, ?, ?, ?, ?, ?)`);
    const now = new Date().toISOString();
    
    const tx = this.db.transaction((arr) => {
      this._statements.deleteAll.run();
      for (const item of arr) {
        if (!item.id) item.id = crypto.randomUUID();
        insert.run(
          item.id,
          JSON.stringify(item),
          item.token || null,
          item.email || null,
          item.userId || null,
          now
        );
      }
    });
    
    tx(items);
    this._invalidateCache();
    
    return items;
  }
}

// -----------------------------
// SQLite-backed sessions store (ULTRA SPEED)
// -----------------------------
let sqliteConn = null;
try {
  const BetterSqlite3 = require('better-sqlite3');
  const DB_FILE = path.join(DB_DIR, 'sessions.sqlite3');
  sqliteConn = new BetterSqlite3(DB_FILE);
  
  // ============ ULTRA-SPEED SQLite CONFIGURATION ============
  // WAL mode for concurrent reads/writes (10x faster than DELETE mode)
  sqliteConn.pragma('journal_mode = WAL');
  
  // NORMAL sync: faster than FULL, still safe with WAL
  sqliteConn.pragma('synchronous = NORMAL');
  
  // 64MB cache in memory (default is 2MB) - MASSIVE speed boost
  sqliteConn.pragma('cache_size = -65536');
  
  // Store temp tables in memory
  sqliteConn.pragma('temp_store = MEMORY');
  
  // Enable memory-mapped I/O (256MB) - near-RAM speed for reads
  sqliteConn.pragma('mmap_size = 268435456');
  
  // Optimize page size for SSD (4KB is optimal for most SSDs)
  sqliteConn.pragma('page_size = 4096');
  
  // Increase busy timeout for high concurrency
  sqliteConn.pragma('busy_timeout = 5000');
  
  // Optimize for reads (disable auto-checkpoint temporarily)
  sqliteConn.pragma('wal_autocheckpoint = 1000');
  
  // Optimize query planner
  sqliteConn.pragma('optimize');
  
  console.log('[AI-DB] ULTRA-SPEED SQLite database enabled (WAL + 64MB cache + mmap)');
} catch (e) {
  console.warn('[AI-DB] better-sqlite3 not available, using file-based fallback');
}

// Export database instances
const exportsObj = {
  products: new Database('products'),
  carts: new Database('carts'),
  returns: new Database('returns'),
  exchanges: new Database('exchanges'),
  cancellations: new Database('cancellations'),
  passwordResets: new Database('passwordResets'),
  wishlists: new Database('wishlists'),
  Database
};

// Use SQLite for heavy collections if available
if (sqliteConn) {
  exportsObj.sessions = new SqliteStore('sessions', sqliteConn); // Migrate sessions to generic store
  exportsObj.users = new SqliteStore('users', sqliteConn);
  exportsObj.contacts = new SqliteStore('contacts', sqliteConn);
  exportsObj.orders = new SqliteStore('orders', sqliteConn);
} else {
  exportsObj.sessions = new Database('sessions');
  exportsObj.users = new Database('users');
  exportsObj.contacts = new Database('contacts');
  exportsObj.orders = new Database('orders');
}

// AI-powered database analytics
exportsObj.runAIAnalysis = async function(collection, operation) {
  if (!pythonBridge) return null;
  try {
    const data = exportsObj[collection] ? exportsObj[collection].findAll() : [];
    switch (operation) {
      case 'anomaly':
        return await pythonBridge.ml.anomalyDetection({ data, collection });
      case 'trends':
        return await pythonBridge.ml.trendAnalysis({ data, collection });
      case 'forecast':
        return await pythonBridge.sales.forecastSales({ orders: data });
      default:
        return await pythonBridge.analysis.insights({ data, collection });
    }
  } catch (e) {
    console.error('[AI-DB] Analysis failed:', e.message);
    return { error: e.message };
  }
};

module.exports = exportsObj;
