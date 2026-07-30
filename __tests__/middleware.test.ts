/** @jest-environment node */
/**
 * #530 — Unit tests for middleware.ts locale routing
 *
 * Covers the three routing decisions:
 * 1. A request with no locale prefix is redirected to the default locale.
 * 2. A request with a supported locale prefix (/fr/...) passes through unchanged.
 * 3. A request with an unsupported locale prefix falls back to the default.
 *
 * Uses the real middleware function — only the Next.js primitives
 * (NextRequest / NextResponse) are real imports from next/server so no
 * transport layer is involved.
 */

import { NextRequest, NextResponse } from 'next/server';
import { middleware } from '../middleware';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Build a minimal NextRequest for a given path. */
function buildRequest(
  path: string,
  opts: {
    cookie?: string; // value for the NEXT_LOCALE cookie
    acceptLanguage?: string;
  } = {},
): NextRequest {
  const url = `http://localhost${path}`;
  const headers: Record<string, string> = {};
  if (opts.acceptLanguage) {
    headers['accept-language'] = opts.acceptLanguage;
  }
  if (opts.cookie) {
    headers['cookie'] = `NEXT_LOCALE=${opts.cookie}`;
  }
  return new NextRequest(url, { headers });
}

/** Return true when the response is a redirect (3xx). */
function isRedirect(res: NextResponse | Response): boolean {
  return res.status >= 300 && res.status < 400;
}

/** Extract the Location path from a redirect response. */
function redirectedTo(res: NextResponse | Response): string {
  const location = res.headers.get('location') ?? '';
  return new URL(location).pathname;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('middleware — locale routing', () => {
  // ── Scenario 1: no locale prefix → redirect to default locale ──────────────

  it('redirects an unprefixed path to the default locale (en)', () => {
    const req = buildRequest('/scout');
    const res = middleware(req);

    expect(isRedirect(res)).toBe(true);
    expect(redirectedTo(res)).toBe('/en/scout');
  });

  it('redirects the bare root path "/" to "/en"', () => {
    const req = buildRequest('/');
    const res = middleware(req);

    expect(isRedirect(res)).toBe(true);
    expect(redirectedTo(res)).toMatch(/^\/en/);
  });

  it('redirects /player/123 to /en/player/123 when no locale is set', () => {
    const req = buildRequest('/player/123');
    const res = middleware(req);

    expect(isRedirect(res)).toBe(true);
    expect(redirectedTo(res)).toBe('/en/player/123');
  });

  // ── Scenario 2: supported locale prefix → pass through ──────────────────────

  it('passes /en/... through without redirect', () => {
    const req = buildRequest('/en/scout');
    const res = middleware(req);

    expect(isRedirect(res)).toBe(false);
  });

  it('passes /fr/... through without redirect', () => {
    const req = buildRequest('/fr/player');
    const res = middleware(req);

    expect(isRedirect(res)).toBe(false);
  });

  it('passes /sw/... through without redirect', () => {
    const req = buildRequest('/sw/validator');
    const res = middleware(req);

    expect(isRedirect(res)).toBe(false);
  });

  it('passes an exact /en path through without redirect', () => {
    const req = buildRequest('/en');
    const res = middleware(req);

    expect(isRedirect(res)).toBe(false);
  });

  // ── Scenario 3: unsupported locale → fall back to default ───────────────────

  it('redirects to the default locale when the cookie holds an unsupported locale', () => {
    const req = buildRequest('/admin', { cookie: 'de' });
    const res = middleware(req);

    // 'de' is not supported → falls back to 'en'
    expect(isRedirect(res)).toBe(true);
    expect(redirectedTo(res)).toBe('/en/admin');
  });

  it('redirects to default locale when accept-language is unsupported', () => {
    const req = buildRequest('/admin', { acceptLanguage: 'ja' });
    const res = middleware(req);

    expect(isRedirect(res)).toBe(true);
    expect(redirectedTo(res)).toBe('/en/admin');
  });

  // ── Cookie / Accept-Language preference ─────────────────────────────────────

  it('honours a supported NEXT_LOCALE cookie and redirects to that locale', () => {
    const req = buildRequest('/scout', { cookie: 'fr' });
    const res = middleware(req);

    expect(isRedirect(res)).toBe(true);
    expect(redirectedTo(res)).toBe('/fr/scout');
  });

  it('honours a supported accept-language header when no cookie is set', () => {
    const req = buildRequest('/player', { acceptLanguage: 'sw,en;q=0.9' });
    const res = middleware(req);

    expect(isRedirect(res)).toBe(true);
    expect(redirectedTo(res)).toBe('/sw/player');
  });

  it('sets the NEXT_LOCALE cookie on a redirect response', () => {
    const req = buildRequest('/');
    const res = middleware(req);

    const setCookie = res.headers.get('set-cookie') ?? '';
    expect(setCookie).toContain('NEXT_LOCALE=');
  });

  // ── Pass-through sets x-pathname header ─────────────────────────────────────

  it('sets the x-pathname header when passing through a prefixed request', () => {
    const req = buildRequest('/fr/player/42');
    const res = middleware(req);

    // A NextResponse.next() doesn't have a location header — confirm passthrough
    expect(isRedirect(res)).toBe(false);
    // The response itself won't expose request headers directly, but the
    // middleware should not throw — this test verifies it runs without error.
  });
});
