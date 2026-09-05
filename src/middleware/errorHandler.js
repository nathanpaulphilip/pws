'use strict';

/**
 * Centralized error handler.
 *
 * Threat mitigated:
 * - Information disclosure: catches unhandled errors and returns generic
 *   messages to the client, preventing stack traces and internal details
 *   from leaking.
 */

const config = require('../config');

function errorHandler(err, req, res, _next) {
  // Log full error server-side for debugging
  console.error(`[${new Date().toISOString()}] ${req.method} ${req.path}:`, err.message);
  if (!config.isProduction) {
    console.error(err.stack);
  }

  // Multer file-size limit
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({
      error: `File exceeds the maximum size of ${config.upload.maxFileSizeMB} MB.`,
    });
  }

  // Multer unexpected field
  if (err.code === 'LIMIT_UNEXPECTED_FILE') {
    return res.status(400).json({ error: 'Unexpected field name in upload.' });
  }

  // Other multer errors
  if (err.code && err.code.startsWith('LIMIT_')) {
    return res.status(400).json({ error: 'File upload limit exceeded.' });
  }

  // JSON parse error
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Invalid JSON in request body.' });
  }

  // Default — do not leak internals
  const statusCode = err.statusCode || 500;
  const message = config.isProduction
    ? 'An internal error occurred. Please try again later.'
    : err.message;

  res.status(statusCode).json({ error: message });
}

module.exports = errorHandler;
