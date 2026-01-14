/**
 * High-Performance SQLite Database Core
 * Used for persistent, structured data like logs, analytics, and sessions.
 * Better than JSON for high-write volume and complex queries.
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, '..', 'data', 'analytics.sqlite3');

// Ensure data directory exists
const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
}

// Initializing the database with WAL mode for high performance
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

// Initialize schema
db.exec(`
  CREATE TABLE IF NOT EXISTS traffic_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    page_url TEXT,
    ip_address TEXT,
    user_agent TEXT,
    session_id TEXT,
    user_id TEXT,
    event_type TEXT DEFAULT 'page_view',
    extra_data TEXT
  );

  CREATE TABLE IF NOT EXISTS performance_metrics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    metric_name TEXT,
    value REAL,
    tags TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_traffic_timestamp ON traffic_logs(timestamp);
  CREATE INDEX IF NOT EXISTS idx_traffic_event ON traffic_logs(event_type);
`);

module.exports = {
  /**
   * Log a traffic event to SQLite
   */
  logTraffic: (data) => {
    const stmt = db.prepare('INSERT INTO traffic_logs (page_url, ip_address, user_agent, session_id, user_id, event_type, extra_data) VALUES (?, ?, ?, ?, ?, ?, ?)');
    return stmt.run(
      data.url || '',
      data.ip || '',
      data.userAgent || '',
      data.sessionId || null,
      data.userId || null,
      data.eventType || 'page_view',
      data.extraData ? JSON.stringify(data.extraData) : null
    );
  },

  /**
   * Get recent traffic summary
   */
  getRecentTraffic: (hours = 24) => {
    const stmt = db.prepare("SELECT count(*) as count, event_type FROM traffic_logs WHERE timestamp > datetime('now', '-' || ? || ' hours') GROUP BY event_type");
    return stmt.all(hours);
  },

  /**
   * Log performance metric
   */
  logMetric: (name, value, tags = {}) => {
    const stmt = db.prepare('INSERT INTO performance_metrics (metric_name, value, tags) VALUES (?, ?, ?)');
    return stmt.run(name, value, JSON.stringify(tags));
  },

  db // Raw access if needed
};
