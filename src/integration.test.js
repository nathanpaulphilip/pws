'use strict';

/**
 * Server integration tests.
 * These start a real server and test the full API.
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');

describe('Server integration', () => {
  let app;
  let serverAddr;

  before(async () => {
    process.env.PORT = '0';
    delete require.cache[require.resolve('../src/config')];
    delete require.cache[require.resolve('../src/server')];
    app = require('../src/server');
    await new Promise((r) => setTimeout(r, 500));
    serverAddr = app.address();
  });

  after(() => {
    try {
      if (app && app.close) app.close();
    } catch { /* ignore */ }
    // Force exit to avoid hanging on cleanup timers
    setTimeout(() => process.exit(0), 1000);
  });

  async function apiFetch(urlPath) {
    const url = `http://localhost:${serverAddr.port}${urlPath}`;
    const res = await fetch(url);
    const body = await res.json();
    return { status: res.status, body };
  }

  it('GET /api/health should return ok', async () => {
    const { status, body } = await apiFetch('/api/health');
    assert.strictEqual(status, 200);
    assert.strictEqual(body.status, 'ok');
    assert.ok(typeof body.uptime === 'number');
  });

  it('GET /api/info should return server info', async () => {
    const { status, body } = await apiFetch('/api/info');
    assert.strictEqual(status, 200);
    assert.strictEqual(body.name, 'Freebuff Desktop');
    assert.ok(Array.isArray(body.allowedTypes));
    assert.ok(body.privacy);
  });

  it('GET /api/upload/nonexistent UUID should return 404', async () => {
    const { status } = await apiFetch('/api/upload/00000000-0000-0000-0000-000000000000');
    assert.strictEqual(status, 404);
  });

  it('GET /api/upload with invalid format should return 400', async () => {
    const { status } = await apiFetch('/api/upload/not-a-uuid.jpg');
    assert.strictEqual(status, 400);
  });

  it('POST /api/upload without file should return 400', async () => {
    const url = `http://localhost:${serverAddr.port}/api/upload`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    assert.strictEqual(res.status, 400);
  });

  it('GET / should serve the HTML frontend', async () => {
    const url = `http://localhost:${serverAddr.port}/`;
    const res = await fetch(url);
    const text = await res.text();
    assert.ok(text.includes('<!DOCTYPE html>'));
    assert.ok(text.includes('Freebuff Desktop'));
  });

  it('GET /unknown-path should serve SPA fallback', async () => {
    const url = `http://localhost:${serverAddr.port}/some-random-path`;
    const res = await fetch(url);
    const text = await res.text();
    assert.ok(text.includes('Freebuff Desktop'));
  });
});
