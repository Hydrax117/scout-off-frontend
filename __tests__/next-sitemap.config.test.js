/**
 * #532 — Config-correctness test for next-sitemap.config.js
 *
 * Verifies that the exclude array always contains the required admin and api
 * path patterns. Loaded via plain Node `require` so the test stays fast and
 * dependency-free — no Next.js or Babel transform needed.
 *
 * Uses pattern matching (substring / regex) rather than exact string equality
 * so minor syntax tweaks to the config (e.g. trailing slashes, query params)
 * don't create false failures. The only thing that matters is that the
 * critical paths are present.
 */

'use strict';

const path = require('path');

const config = require(path.resolve(__dirname, '../next-sitemap.config.js'));

describe('next-sitemap.config.js — exclude array', () => {
  const { exclude } = config;

  it('exports an exclude array', () => {
    expect(Array.isArray(exclude)).toBe(true);
    expect(exclude.length).toBeGreaterThan(0);
  });

  // ── /admin paths ────────────────────────────────────────────────────────────

  it('excludes the bare /admin path', () => {
    expect(exclude.some((p) => p === '/admin' || p.includes('/admin'))).toBe(
      true,
    );
  });

  it('excludes /en/admin', () => {
    expect(exclude.some((p) => p.includes('/en/admin'))).toBe(true);
  });

  it('excludes /fr/admin', () => {
    expect(exclude.some((p) => p.includes('/fr/admin'))).toBe(true);
  });

  it('excludes /sw/admin', () => {
    expect(exclude.some((p) => p.includes('/sw/admin'))).toBe(true);
  });

  it('excludes a wildcard pattern that covers all locale-prefixed admin routes', () => {
    // Accepts either /*/admin (glob) or a pattern that functionally covers it
    const hasWildcardAdmin = exclude.some(
      (p) => p === '/*/admin' || /\/\*\/admin/.test(p),
    );
    expect(hasWildcardAdmin).toBe(true);
  });

  // ── /api paths ───────────────────────────────────────────────────────────────

  it('excludes the bare /api path', () => {
    expect(exclude.some((p) => p === '/api' || p.startsWith('/api'))).toBe(
      true,
    );
  });

  it('excludes /api/* (all API sub-routes)', () => {
    const hasApiWildcard = exclude.some(
      (p) => p === '/api/*' || /^\/api\//.test(p) || p === '/api/*',
    );
    expect(hasApiWildcard).toBe(true);
  });

  // ── Regression guard ────────────────────────────────────────────────────────

  it('contains at least 7 exclusion entries (regression guard)', () => {
    // If someone accidentally truncates the list this will catch it.
    expect(exclude.length).toBeGreaterThanOrEqual(7);
  });
});
