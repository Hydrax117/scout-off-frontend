const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmpDbPath = path.join(
  fs.mkdtempSync(path.join(os.tmpdir(), 'scout-off-backend-logger-test-')),
  'test.db',
);
process.env.DB_PATH = tmpDbPath;

const { createRequestLogger, getOrCreateRequestId, REQUEST_ID_HEADER } = require('../src/logger');
const createApp = require('../src/app');

test.after(() => {
  fs.rmSync(path.dirname(tmpDbPath), { recursive: true, force: true });
});

// ── Request ID propagation ────────────────────────────────────────────────────

test('getOrCreateRequestId propagates an incoming x-request-id header', () => {
  const req = { headers: { [REQUEST_ID_HEADER]: 'incoming-id' } };
  assert.equal(getOrCreateRequestId(req), 'incoming-id');
});

test('getOrCreateRequestId generates a fresh id when there is no header', () => {
  const req = { headers: {} };
  const id = getOrCreateRequestId(req);
  assert.equal(typeof id, 'string');
  assert.ok(id.length > 0);
});

// ── Structured JSON and shared requestId ─────────────────────────────────────

test('createRequestLogger emits structured JSON lines sharing one requestId', () => {
  const originalLog = console.log;
  const originalWarn = console.warn;
  const originalError = console.error;
  const lines = { log: [], warn: [], error: [] };
  console.log = (line) => lines.log.push(line);
  console.warn = (line) => lines.warn.push(line);
  console.error = (line) => lines.error.push(line);

  try {
    const req = {
      headers: { [REQUEST_ID_HEADER]: 'shared-id' },
      originalUrl: '/referrals/generate?foo=bar',
    };
    const log = createRequestLogger(req);
    assert.equal(log.requestId, 'shared-id');

    log.info('starting', { safe: 'ok' });
    log.warn('careful', { secretToken: 'abc123' });
    log.error('boom');

    const info = JSON.parse(lines.log[0]);
    const warn = JSON.parse(lines.warn[0]);
    const error = JSON.parse(lines.error[0]);

    assert.equal(info.requestId, 'shared-id');
    assert.equal(info.route, '/referrals/generate');
    assert.equal(info.safe, 'ok');

    assert.equal(warn.requestId, 'shared-id');
    assert.equal(warn.secretToken, '[REDACTED]');

    assert.equal(error.requestId, 'shared-id');
    assert.equal(error.level, 'error');
  } finally {
    console.log = originalLog;
    console.warn = originalWarn;
    console.error = originalError;
  }
});

// ── #897: explicit log level assertions ──────────────────────────────────────

test('info level: emits to console.log with level "info" and correct message', () => {
  const captured = [];
  const originalLog = console.log;
  console.log = (line) => captured.push(line);
  try {
    const req = { headers: { [REQUEST_ID_HEADER]: 'info-test' }, originalUrl: '/test' };
    const log = createRequestLogger(req);
    log.info('user signed in', { userId: 'u1' });
    assert.equal(captured.length, 1);
    const parsed = JSON.parse(captured[0]);
    assert.equal(parsed.level, 'info');
    assert.equal(parsed.message, 'user signed in');
    assert.equal(parsed.userId, 'u1');
    assert.equal(parsed.requestId, 'info-test');
    assert.ok(parsed.timestamp, 'timestamp should be present');
  } finally {
    console.log = originalLog;
  }
});

test('warn level: emits to console.warn with level "warn" and correct message', () => {
  const captured = [];
  const originalWarn = console.warn;
  console.warn = (line) => captured.push(line);
  try {
    const req = { headers: { [REQUEST_ID_HEADER]: 'warn-test' }, originalUrl: '/test' };
    const log = createRequestLogger(req);
    log.warn('rate limit approaching', { remaining: 5 });
    assert.equal(captured.length, 1);
    const parsed = JSON.parse(captured[0]);
    assert.equal(parsed.level, 'warn');
    assert.equal(parsed.message, 'rate limit approaching');
    assert.equal(parsed.remaining, 5);
  } finally {
    console.warn = originalWarn;
  }
});

test('error level: emits to console.error with level "error" and correct message', () => {
  const captured = [];
  const originalError = console.error;
  console.error = (line) => captured.push(line);
  try {
    const req = { headers: { [REQUEST_ID_HEADER]: 'error-test' }, originalUrl: '/test' };
    const log = createRequestLogger(req);
    log.error('database connection failed', { code: 'ECONNREFUSED' });
    assert.equal(captured.length, 1);
    const parsed = JSON.parse(captured[0]);
    assert.equal(parsed.level, 'error');
    assert.equal(parsed.message, 'database connection failed');
    assert.equal(parsed.code, 'ECONNREFUSED');
  } finally {
    console.error = originalError;
  }
});

// ── #897: sensitive field redaction ──────────────────────────────────────────

test('redacts fields whose key matches the sensitive pattern (secret, token, password)', () => {
  const capturedWarn = [];
  const capturedLog = [];
  const originalWarn = console.warn;
  const originalLog = console.log;
  console.warn = (line) => capturedWarn.push(line);
  console.log = (line) => capturedLog.push(line);
  try {
    const req = { headers: {}, originalUrl: '/auth' };
    const log = createRequestLogger(req);
    log.warn('auth attempt', {
      secretToken: 'super-secret-value',
      password: 'hunter2',
      authorization: 'Bearer eyJhbGci',
      safeField: 'visible',
    });
    const parsed = JSON.parse(capturedWarn[0]);
    assert.equal(parsed.secretToken, '[REDACTED]');
    assert.equal(parsed.password, '[REDACTED]');
    assert.equal(parsed.authorization, '[REDACTED]');
    assert.equal(parsed.safeField, 'visible');
  } finally {
    console.warn = originalWarn;
    console.log = originalLog;
  }
});

test('does not redact safe fields that do not match the sensitive pattern', () => {
  const captured = [];
  const originalLog = console.log;
  console.log = (line) => captured.push(line);
  try {
    const req = { headers: {}, originalUrl: '/players' };
    const log = createRequestLogger(req);
    log.info('player fetched', { playerId: 'p123', region: 'Africa', level: 2 });
    const parsed = JSON.parse(captured[0]);
    assert.equal(parsed.playerId, 'p123');
    assert.equal(parsed.region, 'Africa');
    assert.equal(parsed.level, 2);
  } finally {
    console.log = originalLog;
  }
});

test('wallet address or key-like string in a sensitive-named field is redacted', () => {
  // Stellar wallet addresses start with G and are 56 chars; they may appear in
  // fields like 'authorization' or custom 'walletAddress' keys. If the field
  // key matches the sensitive pattern the value is always masked.
  const captured = [];
  const originalLog = console.log;
  console.log = (line) => captured.push(line);
  try {
    const req = { headers: {}, originalUrl: '/contact' };
    const log = createRequestLogger(req);
    // 'contact' matches the sensitive key pattern
    log.info('contact lookup', {
      contact: 'GCFW7QAO3WZQ6X4CZ3OYZFXX3A3DL7XVI5DNVTXA5VJUGE5SU6ZRG5OV',
    });
    const parsed = JSON.parse(captured[0]);
    assert.equal(parsed.contact, '[REDACTED]');
  } finally {
    console.log = originalLog;
  }
});

test('wallet address in a non-sensitive field name is NOT redacted (key-only matching)', () => {
  // The logger redacts by field key, not field value. A Stellar wallet address
  // stored under a non-sensitive key (e.g. 'playerWallet') should pass through.
  const captured = [];
  const originalLog = console.log;
  console.log = (line) => captured.push(line);
  try {
    const req = { headers: {}, originalUrl: '/players' };
    const log = createRequestLogger(req);
    log.info('player found', {
      playerWallet: 'GCFW7QAO3WZQ6X4CZ3OYZFXX3A3DL7XVI5DNVTXA5VJUGE5SU6ZRG5OV',
    });
    const parsed = JSON.parse(captured[0]);
    // Key 'playerWallet' does NOT match the sensitive pattern, so value is visible.
    assert.equal(
      parsed.playerWallet,
      'GCFW7QAO3WZQ6X4CZ3OYZFXX3A3DL7XVI5DNVTXA5VJUGE5SU6ZRG5OV',
    );
  } finally {
    console.log = originalLog;
  }
});

test('log output is valid JSON for all three levels', () => {
  const lines = { log: [], warn: [], error: [] };
  const origLog = console.log;
  const origWarn = console.warn;
  const origError = console.error;
  console.log = (line) => lines.log.push(line);
  console.warn = (line) => lines.warn.push(line);
  console.error = (line) => lines.error.push(line);
  try {
    const req = { headers: {}, path: '/test' };
    const log = createRequestLogger(req);
    log.info('msg');
    log.warn('msg');
    log.error('msg');
    assert.doesNotThrow(() => JSON.parse(lines.log[0]), 'info line is valid JSON');
    assert.doesNotThrow(() => JSON.parse(lines.warn[0]), 'warn line is valid JSON');
    assert.doesNotThrow(() => JSON.parse(lines.error[0]), 'error line is valid JSON');
  } finally {
    console.log = origLog;
    console.warn = origWarn;
    console.error = origError;
  }
});

// ── App-level request-id header propagation ───────────────────────────────────

test('the app echoes X-Request-Id back on the response, propagating an incoming one', async () => {
  const app = createApp();
  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  try {
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const res = await fetch(`${baseUrl}/health`, {
      headers: { [REQUEST_ID_HEADER]: 'client-supplied-id' },
    });
    assert.equal(res.headers.get(REQUEST_ID_HEADER), 'client-supplied-id');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('the app generates a fresh X-Request-Id when the client sends none', async () => {
  const app = createApp();
  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  try {
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const res = await fetch(`${baseUrl}/health`);
    const id = res.headers.get(REQUEST_ID_HEADER);
    assert.equal(typeof id, 'string');
    assert.ok(id.length > 0);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
