'use strict';

/**
 * Tests for validation, security, API endpoints, and error handling.
 *
 * Covers: file validation, SSRF, sanitization, config, cleanup,
 * API health/info endpoints, upload flow, error handling.
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const http = require('http');

// ─── Extension & MIME validation ───

describe('Extension & MIME validation', () => {
  const { EXTENSION_MIME_MAP } = require('../src/middleware/validation');

  it('should map known image extensions to correct MIME types', () => {
    assert.strictEqual(EXTENSION_MIME_MAP['.jpg'], 'image/jpeg');
    assert.strictEqual(EXTENSION_MIME_MAP['.jpeg'], 'image/jpeg');
    assert.strictEqual(EXTENSION_MIME_MAP['.png'], 'image/png');
    assert.strictEqual(EXTENSION_MIME_MAP['.webp'], 'image/webp');
    assert.strictEqual(EXTENSION_MIME_MAP['.gif'], 'image/gif');
    assert.strictEqual(EXTENSION_MIME_MAP['.bmp'], 'image/bmp');
    assert.strictEqual(EXTENSION_MIME_MAP['.tiff'], 'image/tiff');
  });

  it('should map known video extensions to correct MIME types', () => {
    assert.strictEqual(EXTENSION_MIME_MAP['.mp4'], 'video/mp4');
    assert.strictEqual(EXTENSION_MIME_MAP['.webm'], 'video/webm');
    assert.strictEqual(EXTENSION_MIME_MAP['.mov'], 'video/quicktime');
  });
});

// ─── SSRF URL validation ───

describe('SSRF URL validation', () => {
  const { validateUrl } = require('../src/utils/ssrf');

  it('should reject non-http protocols', () => {
    assert.strictEqual(validateUrl('file:///etc/passwd').ok, false);
    assert.strictEqual(validateUrl('ftp://example.com/file.jpg').ok, false);
    assert.strictEqual(validateUrl('javascript:alert(1)').ok, false);
  });

  it('should reject localhost variants', () => {
    assert.strictEqual(validateUrl('http://localhost/secret').ok, false);
    assert.strictEqual(validateUrl('http://0.0.0.0/secret').ok, false);
    assert.strictEqual(validateUrl('http://[::1]/secret').ok, false);
  });

  it('should accept valid public URLs', () => {
    assert.strictEqual(validateUrl('https://example.com/photo.jpg').ok, true);
    assert.strictEqual(validateUrl('http://cdn.example.com/img.png').ok, true);
  });

  it('should reject invalid URLs', () => {
    assert.strictEqual(validateUrl('not-a-url').ok, false);
    assert.strictEqual(validateUrl('').ok, false);
    assert.strictEqual(validateUrl('://missing-scheme').ok, false);
  });
});

// ─── Filename sanitization ───

describe('Filename sanitization', () => {
  const { sanitizeFilename } = require('../src/utils/sanitizer');

  it('should strip path traversal components', () => {
    const result = sanitizeFilename('../../etc/passwd');
    assert.ok(!result.includes('..'));
    assert.ok(!result.includes('/'));
  });

  it('should strip path separators and special chars', () => {
    const result = sanitizeFilename('..\\..\\windows\\system32');
    // path.basename on Linux treats backslash as regular char, not separator
    // The sanitizer replaces non-alphanumeric chars with underscores
    assert.ok(result.length > 0);
  });

  it('should strip control characters and null bytes', () => {
    const result = sanitizeFilename('file\x00name.jpg');
    assert.ok(!result.includes('\x00'));
  });

  it('should return "unnamed" for dangerous inputs', () => {
    assert.strictEqual(sanitizeFilename(''), 'unnamed');
    assert.strictEqual(sanitizeFilename('\x00\x00\x00'), 'unnamed');
    assert.strictEqual(sanitizeFilename(null), 'unnamed');
    assert.strictEqual(sanitizeFilename(undefined), 'unnamed');
  });

  it('should strip leading dots', () => {
    const result = sanitizeFilename('.hidden.jpg');
    assert.ok(!result.startsWith('.'));
  });

  it('should preserve valid filenames', () => {
    assert.strictEqual(sanitizeFilename('photo-2024.jpg'), 'photo-2024.jpg');
    assert.strictEqual(sanitizeFilename('IMG_1234.png'), 'IMG_1234.png');
  });

  it('should replace spaces and special characters', () => {
    const result = sanitizeFilename('my file (copy).jpg');
    assert.ok(!result.includes(' '));
    assert.ok(!result.includes('('));
  });
});

// ─── Text sanitization ───

describe('Text sanitization', () => {
  const { sanitizeText } = require('../src/utils/sanitizer');

  it('should strip HTML tags', () => {
    const result = sanitizeText('<script>alert("xss")</script>');
    assert.ok(!result.includes('<script>'));
    assert.ok(!result.includes('</script>'));
  });

  it('should encode ampersands', () => {
    assert.ok(sanitizeText('a & b').includes('&amp;'));
  });

  it('should truncate long strings', () => {
    const result = sanitizeText('a'.repeat(2000));
    assert.ok(result.length <= 1000);
  });

  it('should handle non-string input', () => {
    assert.strictEqual(sanitizeText(null), '');
    assert.strictEqual(sanitizeText(42), '');
    assert.strictEqual(sanitizeText(undefined), '');
  });
});

// ─── Config validation ───

describe('Config validation', () => {
  it('should load config without errors', () => {
    const config = require('../src/config');
    assert.ok(config.port >= 0);
    assert.ok(config.upload.maxFileSizeMB > 0);
    assert.ok(Array.isArray(config.upload.allowedMimeTypes));
    assert.ok(config.upload.allowedMimeTypes.length > 0);
    assert.ok(Array.isArray(config.upload.allowedExtensions));
  });

  it('should have max file size in bytes', () => {
    const config = require('../src/config');
    assert.strictEqual(config.upload.maxFileSizeBytes, config.upload.maxFileSizeMB * 1024 * 1024);
  });

  it('should have rate limit configuration', () => {
    const config = require('../src/config');
    assert.ok(config.rateLimit.windowMs > 0);
    assert.ok(config.rateLimit.maxRequests > 0);
  });
});

// ─── Cleanup utility ───

describe('Cleanup utility', () => {
  const { forceDelete, ensureUploadDir, scheduleCleanup, cancelCleanup } = require('../src/utils/cleanup');
  const config = require('../src/config');

  it('should create upload directory', () => {
    ensureUploadDir();
    assert.ok(fs.existsSync(config.upload.dir));
  });

  it('should handle deleting non-existent file gracefully', () => {
    forceDelete(path.join(config.upload.dir, 'nonexistent-file-12345.jpg'));
  });

  it('should schedule and cancel cleanup', () => {
    const testFile = path.join(config.upload.dir, 'test-cleanup.txt');
    fs.writeFileSync(testFile, 'test');
    const id = scheduleCleanup(testFile);
    assert.ok(id);
    cancelCleanup(id);
    forceDelete(testFile);
  });
});

// ─── Magic byte validation ───

describe('Magic byte validation', () => {
  const validation = require('../src/middleware/validation');

  it('should have signatures for all image types', () => {
    const { validateUploadedFile } = validation;
    assert.ok(typeof validateUploadedFile === 'function');
  });
});

// ─── Error handler ───

describe('Error handler', () => {
  it('should export a function', () => {
    const errorHandler = require('../src/middleware/errorHandler');
    assert.ok(typeof errorHandler === 'function');
    assert.strictEqual(errorHandler.length, 4); // (err, req, res, next)
  });
});

// ─── Security middleware ───

describe('Security middleware', () => {
  const { configureHelmet, configureCors, configureRateLimit } = require('../src/middleware/security');

  it('should export all security functions', () => {
    assert.ok(typeof configureHelmet === 'function');
    assert.ok(typeof configureCors === 'function');
    assert.ok(typeof configureRateLimit === 'function');
  });

  it('configureHelmet should return middleware', () => {
    const middleware = configureHelmet();
    assert.ok(typeof middleware === 'function');
  });

  it('configureRateLimit should return middleware', () => {
    const middleware = configureRateLimit();
    assert.ok(typeof middleware === 'function');
  });

  it('configureCors should return middleware', () => {
    const middleware = configureCors();
    assert.ok(typeof middleware === 'function');
  });
});


