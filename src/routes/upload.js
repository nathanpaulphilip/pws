'use strict';

/**
 * Upload route — handles file upload, validation, and returns the file
 * ID for browser-side analysis.
 *
 * Privacy: uploaded files are stored temporarily and auto-deleted.
 * The server does NOT perform any image analysis — all analysis
 * runs in the browser for maximum privacy.
 */

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const config = require('../config');
const { validateUploadedFile } = require('../middleware/validation');
const { sanitizeFilename } = require('../utils/sanitizer');
const { scheduleCleanup, forceDelete, ensureUploadDir } = require('../utils/cleanup');

const router = express.Router();

// Configure multer storage
ensureUploadDir();

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, config.upload.dir),
  filename: (req, file, cb) => {
    const id = uuidv4();
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${id}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: config.upload.maxFileSizeBytes,
    files: 1,
  },
  fileFilter: (_req, file, cb) => {
    // Pre-filter by extension before multer saves
    const ext = path.extname(file.originalname).toLowerCase();
    if (!config.upload.allowedExtensions.includes(ext)) {
      return cb(null, false);
    }
    cb(null, true);
  },
});

/**
 * POST /api/upload
 * Upload a file for analysis. Returns a file ID and metadata.
 * The file is temporary and will be auto-deleted.
 */
router.post(
  '/',
  upload.single('media'),
  validateUploadedFile,
  (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded.' });
    }

    const file = req.file;
    const cleanupId = scheduleCleanup(file.path);

    res.json({
      fileId: path.basename(file.path, path.extname(file.path)),
      filename: file.sanitizedFilename,
      originalName: sanitizeFilename(file.originalname),
      mimeType: file.mimetype,
      size: file.size,
      sizeFormatted: formatBytes(file.size),
      message: 'File uploaded. Analysis will run in your browser — no data is sent to the server.',
    });
  }
);

/**
 * GET /api/upload/:fileId
 * Serve a temporarily uploaded file for browser-side analysis.
 * This is the ONLY way to access the file — it's not publicly listed.
 */
router.get('/:fileId', (req, res) => {
  const { fileId } = req.params;

  // Validate fileId format (UUID only)
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(fileId)) {
    return res.status(400).json({ error: 'Invalid file ID format.' });
  }

  // Find the file with any allowed extension
  const uploadDir = config.upload.dir;

  for (const ext of config.upload.allowedExtensions) {
    const filePath = path.join(uploadDir, `${fileId}${ext}`);
    if (fs.existsSync(filePath)) {
      const stat = fs.statSync(filePath);

      // Content-Type based on extension
      const mimeMap = {
        '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
        '.gif': 'image/gif', '.webp': 'image/webp', '.bmp': 'image/bmp',
        '.tiff': 'image/tiff', '.tif': 'image/tiff',
        '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime',
      };

      const contentType = mimeMap[ext] || 'application/octet-stream';

      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Length', stat.size);
      res.setHeader('Cache-Control', 'no-store, private');

      const stream = fs.createReadStream(filePath);
      stream.pipe(res);

      // Delete after serving (one-time use)
      stream.on('end', () => {
        setTimeout(() => forceDelete(filePath), 1000);
      });

      return;
    }
  }

  res.status(404).json({ error: 'File not found or has been deleted.' });
});

/**
 * DELETE /api/upload/:fileId
 * Manually delete an uploaded file (early cleanup).
 */
router.delete('/:fileId', (req, res) => {
  const { fileId } = req.params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(fileId)) {
    return res.status(400).json({ error: 'Invalid file ID format.' });
  }

  for (const ext of config.upload.allowedExtensions) {
    const filePath = path.join(config.upload.dir, `${fileId}${ext}`);
    if (fs.existsSync(filePath)) {
      forceDelete(filePath);
      return res.json({ message: 'File deleted.' });
    }
  }

  res.status(404).json({ error: 'File not found or already deleted.' });
});

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

module.exports = router;
