'use strict';

/**
 * Centralized configuration — every tunable knob lives here.
 * Environment variables are validated at startup so misconfigurations
 * surface immediately rather than at request time.
 */

const path = require('path');

function env(key, fallback) {
  const v = process.env[key];
  if (v === undefined || v === '') return fallback;
  return v;
}

function envInt(key, fallback) {
  const v = env(key, fallback);
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) {
    throw new Error(`Environment variable ${key} must be a non-negative number, got "${v}"`);
  }
  return n;
}

const config = {
  port: envInt('PORT', 3000),
  nodeEnv: env('NODE_ENV', 'development'),
  isProduction: env('NODE_ENV', 'development') === 'production',

  upload: {
    dir: path.resolve(env('UPLOAD_DIR', './uploads')),
    maxFileSizeMB: envInt('MAX_FILE_SIZE_MB', 10),
    get maxFileSizeBytes() {
      return this.maxFileSizeMB * 1024 * 1024;
    },
    tempFileTTLms: envInt('TEMP_FILE_TTL_MS', 300_000), // 5 min default
    allowedMimeTypes: [
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/gif',
      'image/bmp',
      'image/tiff',
      'video/mp4',
      'video/webm',
      'video/quicktime',
    ],
    allowedExtensions: [
      '.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.tiff', '.tif',
      '.mp4', '.webm', '.mov',
    ],
  },

  rateLimit: {
    windowMs: envInt('RATE_LIMIT_WINDOW_MS', 600_000), // 10 min
    maxRequests: envInt('RATE_LIMIT_MAX_REQUESTS', 20),
  },

  corsOrigins: env('CORS_ORIGINS', '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),

  // Optional external API
  externalApiUrl: env('ANALYSIS_API_URL', ''),
  externalApiKey: env('OPENAI_API_KEY', ''),
};

module.exports = config;
