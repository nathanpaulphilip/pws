'use strict';

/**
 * Freebuff Desktop — AI Media Authenticity Analyzer
 *
 * Configures Express with security middleware,
 * mounts API routes, serves static frontend.
 * Exports the app for both local dev and Vercel serverless.
 */

const express = require('express');
const path = require('path');
const config = require('./config');
const { configureHelmet, configureCors, configureRateLimit } = require('./middleware/security');
const errorHandler = require('./middleware/errorHandler');
const { ensureUploadDir } = require('./utils/cleanup');

const app = express();

// --- Security middleware ---
app.use(configureHelmet());
app.use(configureCors());

// --- Body parsing (limited) ---
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));

// --- Rate limiting on API routes ---
app.use('/api', configureRateLimit());

// --- API routes ---
const uploadRouter = require('./routes/upload');
const healthRouter = require('./routes/health');

app.use('/api', healthRouter);
app.use('/api/upload', uploadRouter);

// --- Static frontend (local dev only — Vercel serves from outputDirectory) ---
const clientDir = path.join(__dirname, '..', 'client');
const fs = require('fs');
if (fs.existsSync(clientDir)) {
  app.use(express.static(clientDir, {
    index: 'index.html',
    maxAge: config.isProduction ? '1h' : 0,
  }));

  // SPA fallback
  const indexPath = path.join(clientDir, 'index.html');
  app.get('*', (_req, res) => {
    res.sendFile(indexPath);
  });
}

// --- Error handler (must be last) ---
app.use(errorHandler);

// --- Ensure upload directory exists ---
ensureUploadDir();

// --- Start server (local dev only — Vercel handles listening) ---
if (require.main === module) {
  const { startPeriodicCleanup } = require('./utils/cleanup');
  startPeriodicCleanup();

  const server = app.listen(config.port, () => {
    console.log(`Freebuff Desktop running on http://localhost:${config.port}`);
    console.log(`Environment: ${config.nodeEnv}`);
    console.log(`Max upload: ${config.upload.maxFileSizeMB} MB`);
  });

  function shutdown(signal) {
    console.log(`\n${signal} received. Shutting down...`);
    server.close(() => { process.exit(0); });
    setTimeout(() => process.exit(1), 5000);
  }
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

module.exports = app;
