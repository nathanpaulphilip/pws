'use strict';

/**
 * File validation middleware.
 *
 * Threats mitigated:
 * - Malicious file uploads: validates MIME type, extension, and
 *   magic-byte signature to prevent disguised executables/scripts.
 * - Denial of service: enforces file size limits.
 * - Path traversal: strips dangerous path components from filenames.
 */

const fs = require('fs');
const path = require('path');
const config = require('../config');
const { sanitizeFilename } = require('../utils/sanitizer');

// Magic-byte signatures for allowed image/video types
const SIGNATURES = {
  'image/jpeg': [[0xff, 0xd8, 0xff]],
  'image/png':  [[0x89, 0x50, 0x4e, 0x47]],
  'image/gif':  [[0x47, 0x49, 0x46, 0x38]],
  'image/webp': [[0x52, 0x49, 0x46, 0x46]], // RIFF header
  'image/bmp':  [[0x42, 0x4d]],
  'image/tiff': [[0x49, 0x49, 0x2a, 0x00], [0x4d, 0x4d, 0x00, 0x2a]],
  'video/mp4':  [[0x00, 0x00, 0x00]], // ftyp box (first 4 bytes vary)
  'video/webm': [[0x1a, 0x45, 0xdf, 0xa3]],
  'video/quicktime': [[0x00, 0x00, 0x00]], // similar to mp4
};

// Extension → expected MIME mapping
const EXTENSION_MIME_MAP = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.png': 'image/png', '.gif': 'image/gif',
  '.webp': 'image/webp', '.bmp': 'image/bmp',
  '.tiff': 'image/tiff', '.tif': 'image/tiff',
  '.mp4': 'video/mp4', '.webm': 'video/webm',
  '.mov': 'video/quicktime',
};

function matchesSignature(buffer, signature) {
  for (let i = 0; i < signature.length; i++) {
    if (buffer[i] !== signature[i]) return false;
  }
  return true;
}

function validateMagicBytes(buffer, mimeType) {
  const sigs = SIGNATURES[mimeType];
  if (!sigs) return true; // no signature defined — accept
  return sigs.some((sig) => matchesSignature(buffer, sig));
}

/**
 * Express middleware — runs after multer has stored the file.
 * Validates extension, MIME type, magic bytes, and sanitizes filename.
 */
function validateUploadedFile(req, res, next) {
  if (!req.file) {
    return res.status(400).json({ error: 'No file provided.' });
  }

  const file = req.file;
  const ext = path.extname(file.originalname).toLowerCase();

  // 1. Extension check
  if (!config.upload.allowedExtensions.includes(ext)) {
    return res.status(400).json({
      error: `File extension "${ext}" is not supported.`,
      allowed: config.upload.allowedExtensions,
    });
  }

  // 2. MIME type check (from multer / browser)
  const declaredMime = file.mimetype;
  if (!config.upload.allowedMimeTypes.includes(declaredMime)) {
    return res.status(400).json({
      error: `MIME type "${declaredMime}" is not supported.`,
      allowed: config.upload.allowedMimeTypes,
    });
  }

  // 3. Extension ↔ MIME consistency check
  const expectedMime = EXTENSION_MIME_MAP[ext];
  if (expectedMime && expectedMime !== declaredMime) {
    return res.status(400).json({
      error: 'File extension does not match declared MIME type.',
    });
  }

  // 4. Magic-byte verification
  try {
    let header;
    if (file.buffer) {
      // Memory storage (serverless)
      header = file.buffer.slice(0, 12);
    } else if (file.path) {
      // Disk storage (local dev)
      header = Buffer.alloc(12);
      const fd = fs.openSync(file.path, 'r');
      fs.readSync(fd, header, 0, 12, 0);
      fs.closeSync(fd);
    } else {
      return res.status(400).json({ error: 'Could not read file contents.' });
    }

    if (!validateMagicBytes(header, declaredMime)) {
      return res.status(400).json({
        error: 'File content does not match its declared type (magic-byte check failed).',
      });
    }
  } catch {
    return res.status(500).json({ error: 'Could not verify file contents.' });
  }

  // 5. Sanitize filename for storage
  file.sanitizedFilename = sanitizeFilename(file.originalname);

  next();
}

function cleanupFile(filePath) {
  try { fs.unlinkSync(filePath); } catch { /* best effort */ }
}

module.exports = { validateUploadedFile, EXTENSION_MIME_MAP };
