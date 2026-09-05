'use strict';

/**
 * Vercel serverless function entry point.
 * Imports the Express app and re-exports it for Vercel's Node.js runtime.
 *
 * Vercel handles HTTP listening; we just provide the app.
 */

const app = require('../src/server');

module.exports = app;
