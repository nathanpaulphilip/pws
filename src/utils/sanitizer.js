'use strict';

/**
 * Input sanitization utilities.
 *
 * Threat mitigated:
 * - XSS: neutralizes script injection in user-supplied strings
 *   rendered back in HTML.
 * - Path traversal: strips directory components from filenames.
 */

const path = require('path');

/**
 * Strip HTML tags and dangerous characters from a string.
 * Intended for user-supplied labels / notes, not for rich-text fields.
 */
function sanitizeText(input) {
  if (typeof input !== 'string') return '';
  return input
    .replace(/[<>]/g, '')  // strip angle brackets
    .replace(/&/g, '&amp;') // encode ampersands last
    .trim()
    .slice(0, 1000); // cap length
}

/**
 * Sanitize a filename: strip path traversal components, control characters,
 * and keep only a safe basename.
 */
function sanitizeFilename(input) {
  if (typeof input !== 'string') return 'unnamed';

  // Take only the basename (strip directories)
  let name = path.basename(input);

  // Remove null bytes and control characters
  name = name.replace(/[\x00-\x1f\x7f]/g, '');

  // Replace spaces and special chars with underscores
  name = name.replace(/[^a-zA-Z0-9._-]/g, '_');

  // Collapse multiple underscores
  name = name.replace(/_{2,}/g, '_');

  // Trim dots (Windows hidden files / traversal)
  name = name.replace(/^\.+/, '');

  return name || 'unnamed';
}

/**
 * Validate that a string looks like a reasonable user-supplied note/label.
 */
function validateUserNote(input) {
  if (typeof input !== 'string') return { valid: false, reason: 'Note must be a string' };
  if (input.length > 1000) return { valid: false, reason: 'Note exceeds 1000 characters' };
  return { valid: true };
}

module.exports = { sanitizeText, sanitizeFilename, validateUserNote };
