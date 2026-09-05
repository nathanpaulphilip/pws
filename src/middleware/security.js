'use strict';

/**
 * Security middleware configuration.
 *
 * Threats mitigated:
 * - Helmet: sets various HTTP headers (X-Frame-Options, CSP, HSTS, etc.)
 *   to protect against clickjacking, XSS, MIME sniffing, etc.
 * - CORS: restricts cross-origin requests to trusted origins.
 * - Rate limiting: prevents brute-force and denial-of-service attacks.
 */

const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const config = require('../config');

function configureHelmet() {
  return helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"], // inline styles for minimal CSS
        imgSrc: ["'self'", 'blob:', 'data:', 'https:'],
        connectSrc: ["'self'", 'https:'],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
      },
    },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    hsts: config.isProduction ? { maxAge: 31536000, includeSubDomains: true } : false,
  });
}

function configureCors() {
  return (req, res, next) => {
    const origin = req.headers.origin;
    if (config.corsOrigins.length === 0) {
      // Same-origin only — no Access-Control-Allow-Origin header
      // Browser will block cross-origin requests by default
      return next();
    }
    if (config.corsOrigins.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      res.setHeader('Access-Control-Max-Age', '86400');
    }
    if (req.method === 'OPTIONS') {
      return res.sendStatus(204);
    }
    next();
  };
}

function configureRateLimit() {
  return rateLimit({
    windowMs: config.rateLimit.windowMs,
    max: config.rateLimit.maxRequests,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      error: 'Too many requests. Please try again later.',
      retryAfterSeconds: Math.ceil(config.rateLimit.windowMs / 1000),
    },
    // Trust proxy count for rate limiting behind reverse proxy
    keyGenerator: (req) => {
      return req.ip || req.headers['x-forwarded-for'] || 'unknown';
    },
  });
}

module.exports = { configureHelmet, configureCors, configureRateLimit };
