/**
 * Vercel compatibility entry point (serverless).
 * This file is only needed when deploying to serverless platforms (e.g., Vercel).
 * For VPS/PM2 deployments use `backend/server.js` directly.
 */

module.exports = require('./server.js');
