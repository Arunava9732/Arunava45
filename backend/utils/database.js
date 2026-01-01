/**
 * JSON File Database Utility
 * Simple file-based storage for the full-stack website
 * Can be replaced with MongoDB/PostgreSQL for production
 */

const fs = require('fs');
const path = require('path');

const DB_DIR = path.join(__dirname, '..', 'data');

// Ensure data directory exists
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
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
    this._ensureFile();
    this._loadCache(); // Initial load
    
    // Watch for external changes (e.g. manual edits)
    try {
      fs.watch(this.filePath, (eventType) => {
        if (eventType === 'change') {
          this.cache = null; // Invalidate cache
        }
      });
    } catch (e) {
      // Ignore watch errors
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
      const data = fs.readFileSync(this.filePath, 'utf8');
      this.cache = JSON.parse(data);
      this.lastRead = Date.now();
    } catch (error) {
      console.error(`Error reading ${this.collection}:`, error);
      this.cache = DEFAULTS[this.collection] || [];
    }
  }

  _read() {
    // Use cache if available
    if (this.cache) return this.cache;
    this._loadCache();
    return this.cache;
  }

  _write(data) {
    try {
      // Update cache immediately
      this.cache = data;
      
      // ATOMIC WRITE: Write to temp file first, then rename
      // This prevents data corruption if the process crashes during write
      const tempPath = `${this.filePath}.tmp`;
      fs.writeFileSync(tempPath, JSON.stringify(data, null, 2));
      fs.renameSync(tempPath, this.filePath);
      
      return true;
    } catch (error) {
      console.error(`Error writing ${this.collection}:`, error);
      return false;
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

  findById(id) {
    const data = this._read();
    if (Array.isArray(data)) {
      return data.find(item => item.id === id);
    }
    return data[id];
  }

  findOne(query) {
    const data = this._read();
    if (!Array.isArray(data)) return null;
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
    return data.filter(item => {
      return Object.entries(query).every(([key, value]) => {
        if (typeof value === 'function') return value(item[key]);
        return item[key] === value;
      });
    });
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
      const index = data.findIndex(item => item.id === id);
      if (index !== -1) {
        data[index] = { ...data[index], ...updates };
        this._write(data);
        return data[index];
      }
    }
    return null;
  }

  delete(id) {
    const data = this._read();
    if (Array.isArray(data)) {
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

  // Bulk operations
  insertMany(items) {
    const data = this._read();
    if (Array.isArray(data)) {
      data.push(...items);
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

// -----------------------------
// SQLite-backed sessions store
// -----------------------------
let SqliteSessions = null;
try {
  const BetterSqlite3 = require('better-sqlite3');
  const DB_FILE = path.join(DB_DIR, 'sessions.sqlite3');
  const sdb = new BetterSqlite3(DB_FILE);
  sdb.pragma('journal_mode = WAL');

  // Create sessions table
  sdb.prepare(`CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    userId TEXT,
    token TEXT UNIQUE,
    data TEXT,
    createdAt TEXT,
    lastActivity TEXT,
    expiresAt TEXT
  )`).run();

  SqliteSessions = class {
    findAll() {
      const rows = sdb.prepare('SELECT data FROM sessions').all();
      return rows.map(r => JSON.parse(r.data));
    }

    findById(id) {
      const row = sdb.prepare('SELECT data FROM sessions WHERE id = ?').get(id);
      return row ? JSON.parse(row.data) : null;
    }

    findOne(query) {
      // Fast path for token
      if (query && query.token) {
        const row = sdb.prepare('SELECT data FROM sessions WHERE token = ?').get(query.token);
        return row ? JSON.parse(row.data) : null;
      }
      // Fallback to in-memory filter (small table)
      const all = this.findAll();
      return all.find(item => Object.entries(query).every(([k, v]) => item[k] === v));
    }

    create(session) {
      const stmt = sdb.prepare('INSERT INTO sessions (id,userId,token,data,createdAt,lastActivity,expiresAt) VALUES (?,?,?,?,?,?,?)');
      stmt.run(session.id, session.userId, session.token, JSON.stringify(session), session.createdAt, session.lastActivity, session.expiresAt);
      return session;
    }

    update(id, updates) {
      const existing = this.findById(id);
      if (!existing) return null;
      const merged = { ...existing, ...updates };
      const stmt = sdb.prepare('UPDATE sessions SET data = ?, userId = ?, token = ?, lastActivity = ?, expiresAt = ? WHERE id = ?');
      stmt.run(JSON.stringify(merged), merged.userId, merged.token, merged.lastActivity, merged.expiresAt, id);
      return merged;
    }

    delete(id) {
      const info = sdb.prepare('DELETE FROM sessions WHERE id = ?').run(id);
      return info.changes > 0;
    }

    replaceAll(items) {
      const insert = sdb.prepare('INSERT INTO sessions (id,userId,token,data,createdAt,lastActivity,expiresAt) VALUES (?,?,?,?,?,?,?)');
      const tx = sdb.transaction((arr) => {
        sdb.prepare('DELETE FROM sessions').run();
        for (const s of arr) {
          insert.run(s.id, s.userId, s.token, JSON.stringify(s), s.createdAt, s.lastActivity, s.expiresAt);
        }
      });
      tx(items || []);
      return items;
    }
  };

  // If existing sessions.json exists and sqlite table empty, migrate
  try {
    const countRow = sdb.prepare('SELECT COUNT(*) as cnt FROM sessions').get();
    const count = countRow ? countRow.cnt : 0;
    const sessionsFile = path.join(DB_DIR, 'sessions.json');
    if (count === 0 && fs.existsSync(sessionsFile)) {
      const raw = fs.readFileSync(sessionsFile, 'utf8');
      const arr = JSON.parse(raw);
      if (Array.isArray(arr) && arr.length > 0) {
        const inst = new SqliteSessions();
        inst.replaceAll(arr);
      }
    }
  } catch (e) {
    console.warn('Session migration skipped:', e && e.message);
  }
} catch (e) {
  // If better-sqlite3 not available, fall back to file DB for sessions
  console.warn('better-sqlite3 not available, using file-based sessions. Install better-sqlite3 for production.');
  SqliteSessions = null;
}

// Export database instances
const exportsObj = {
  users: new Database('users'),
  products: new Database('products'),
  orders: new Database('orders'),
  carts: new Database('carts'),
  returns: new Database('returns'),
  contacts: new Database('contacts'),
  passwordResets: new Database('passwordResets'),
  Database
};

// Use SQLite-backed sessions if available
if (SqliteSessions) {
  exportsObj.sessions = new SqliteSessions();
} else {
  exportsObj.sessions = new Database('sessions');
}

module.exports = exportsObj;
