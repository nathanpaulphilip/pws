'use strict';

/**
 * Temp file cleanup — ensures uploaded files are deleted after processing
 * or after a TTL expires.
 *
 * Privacy mitigated:
 * - Minimal data retention: files are cleaned up automatically.
 * - Automatic deletion after analysis.
 */

const fs = require('fs');
const path = require('path');
const config = require('../config');

const scheduledCleanups = new Map();

/**
 * Ensure the upload directory exists.
 */
function ensureUploadDir() {
  try {
    if (!fs.existsSync(config.upload.dir)) {
      fs.mkdirSync(config.upload.dir, { recursive: true });
    }
  } catch {
    // Vercel serverless: filesystem is read-only, skip directory creation
  }
}

/**
 * Schedule a file for deletion after TTL milliseconds.
 * Returns a cleanup ID that can be used to cancel or force-cleanup.
 */
function scheduleCleanup(filePath) {
  const id = filePath + '_' + Date.now();
  const timer = setTimeout(() => {
    forceDelete(filePath);
    scheduledCleanups.delete(id);
  }, config.upload.tempFileTTLms);
  scheduledCleanups.set(id, timer);
  return id;
}

/**
 * Force-delete a file immediately (after analysis completes).
 */
function forceDelete(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (err) {
    console.error(`Failed to clean up ${filePath}:`, err.message);
  }
}

/**
 * Cancel a scheduled cleanup (e.g., if force-delete already ran).
 */
function cancelCleanup(id) {
  const timer = scheduledCleanups.get(id);
  if (timer) {
    clearTimeout(timer);
    scheduledCleanups.delete(id);
  }
}

/**
 * Periodic sweep: delete any files older than the TTL.
 * Runs every 60 seconds as a safety net.
 */
function startPeriodicCleanup() {
  ensureUploadDir();

  setInterval(() => {
    const now = Date.now();
    try {
      const files = fs.readdirSync(config.upload.dir);
      for (const file of files) {
        const filePath = path.join(config.upload.dir, file);
        try {
          const stat = fs.statSync(filePath);
          if (stat.isFile() && (now - stat.mtimeMs) > config.upload.tempFileTTLms) {
            forceDelete(filePath);
          }
        } catch { /* skip unreadable files */ }
      }
    } catch { /* upload dir may not exist yet */ }
  }, 60_000);
}

module.exports = { ensureUploadDir, scheduleCleanup, forceDelete, cancelCleanup, startPeriodicCleanup };
