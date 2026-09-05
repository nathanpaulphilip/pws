'use strict';

/**
 * SSRF protection — validates and sanitizes user-supplied URLs.
 *
 * Threat mitigated:
 * - Server-Side Request Forgery: prevents the server from making requests
 *   to internal/private network addresses, cloud metadata endpoints, or
 *   other non-public resources on behalf of the user.
 */

const { URL } = require('url');
const dns = require('dns');
const { isIPv4, isIPv6 } = require('net');

// RFC reserved / private IP ranges
const PRIVATE_RANGES = [
  { label: 'loopback', test: (addr) => addr === '127.0.0.1' || addr === '::1' },
  { label: 'private-10', test: (addr) => isIPv4(addr) && addr.startsWith('10.') },
  { label: 'private-172', test: (addr) => {
    if (!isIPv4(addr)) return false;
    const octets = addr.split('.').map(Number);
    return octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31;
  }},
  { label: 'private-192', test: (addr) => isIPv4(addr) && addr.startsWith('192.168.') },
  { label: 'link-local', test: (addr) => addr.startsWith('169.254.') },
  { label: 'metadata', test: (addr) => addr === '169.254.169.254' },
  { label: 'unspecified', test: (addr) => addr === '0.0.0.0' || addr === '::' },
  { label: 'reserved', test: (addr) => isIPv6(addr) && (addr.startsWith('fc') || addr.startsWith('fd') || addr.startsWith('fe80')) },
];

function isPrivateIP(addr) {
  return PRIVATE_RANGES.some((r) => r.test(addr));
}

/**
 * Check if a URL is safe to fetch (no SSRF vectors).
 * Returns { ok: true } or { ok: false, reason: string }.
 */
function validateUrl(raw) {
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    return { ok: false, reason: 'Invalid URL format' };
  }

  const proto = parsed.protocol;
  if (proto !== 'http:' && proto !== 'https:') {
    return { ok: false, reason: `Protocol "${proto}" is not allowed. Only http and https are supported.` };
  }

  // Block localhost variants
  const host = parsed.hostname.toLowerCase();
  if (host === 'localhost' || host === '0.0.0.0' || host === '[::1]') {
    return { ok: false, reason: 'Requests to localhost are not allowed.' };
  }

  return { ok: true };
}

/**
 * Async version: resolves the hostname and checks for private IPs.
 * Use this before making actual fetch calls.
 */
function validateUrlAsync(raw) {
  return new Promise((resolve) => {
    const basic = validateUrl(raw);
    if (!basic.ok) return resolve(basic);

    let parsed;
    try {
      parsed = new URL(raw);
    } catch {
      return resolve({ ok: false, reason: 'Invalid URL format' });
    }

    const hostname = parsed.hostname;

    // Quick check for IP literals
    if (isIPv4(hostname) || isIPv6(hostname)) {
      if (isPrivateIP(hostname)) {
        return resolve({ ok: false, reason: 'URL resolves to a private/reserved IP address.' });
      }
      return resolve({ ok: true });
    }

    // DNS resolution check
    dns.resolve4(hostname, (err, addresses) => {
      if (err && err.code === 'ENOTFOUND') {
        // Try IPv6
        dns.resolve6(hostname, (err6, addrs6) => {
          if (err6) {
            return resolve({ ok: false, reason: 'Could not resolve hostname.' });
          }
          if (addrs6.some(isPrivateIP)) {
            return resolve({ ok: false, reason: 'URL resolves to a private/reserved IP address.' });
          }
          resolve({ ok: true });
        });
        return;
      }
      if (err) {
        return resolve({ ok: false, reason: 'DNS resolution failed.' });
      }
      if (addresses.some(isPrivateIP)) {
        return resolve({ ok: false, reason: 'URL resolves to a private/reserved IP address.' });
      }
      resolve({ ok: true });
    });
  });
}

module.exports = { validateUrl, validateUrlAsync };
