/**
 * Deprecated app shim.
 *
 * This project now uses `backend/server.js` as the single entrypoint
 * for VPS/PM2 deployments. Keep this file as a tiny shim so older
 * tooling doesn't break if it expects `app.js`.
 */

module.exports = require('./server.js');
