/** @jest-environment node */
import { NextRequest } from 'next/server';
import {
  createSessionToken,
  verifySessionToken,
  getSessionWallet,
  ACCESS_TOKEN_TTL_SEC,
  DEFAULT_REFRESH_TTL_SEC,
  REMEMBER_ME_REFRESH_TTL_SEC,
} from '@/lib/session';

const PUBLIC_KEY = 'GTESTKEY0000000000000000000000000000000000000000000000000';

describe('createSessionToken / verifySessionToken', () => {
  it('round-trips a valid access token', () => {
    const token = createSessionToken(
      PUBLIC_KEY,
      'access',
      ACCESS_TOKEN_TTL_SEC,
    );
    const payload = verifySessionToken(token, 'access');
    expect(payload?.sub).toBe(PUBLIC_KEY);
    expect(payload?.typ).toBe('access');
  });

  it('round-trips a valid refresh token and carries the remember flag', () => {
    const token = createSessionToken(
      PUBLIC_KEY,
      'refresh',
      REMEMBER_ME_REFRESH_TTL_SEC,
      { remember: true },
    );
    const payload = verifySessionToken(token, 'refresh');
    expect(payload?.sub).toBe(PUBLIC_KEY);
    expect(payload?.remember).toBe(true);
  });

  it('rejects a token whose signature has been tampered with', () => {
    const token = createSessionToken(
      PUBLIC_KEY,
      'access',
      ACCESS_TOKEN_TTL_SEC,
    );
    const [payloadB64] = token.split('.');
    expect(
      verifySessionToken(`${payloadB64}.forgedsignature`, 'access'),
    ).toBeNull();
  });

  it('rejects a token whose payload has been tampered with (signature no longer matches)', () => {
    const token = createSessionToken(
      PUBLIC_KEY,
      'access',
      ACCESS_TOKEN_TTL_SEC,
    );
    const [, signature] = token.split('.');
    const forgedPayload = Buffer.from(
      JSON.stringify({
        sub: 'GATTACKERADDRESS000000000000000000000000000000000000000',
        typ: 'access',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + ACCESS_TOKEN_TTL_SEC,
      }),
    ).toString('base64url');
    expect(
      verifySessionToken(`${forgedPayload}.${signature}`, 'access'),
    ).toBeNull();
  });

  it('rejects an expired token', () => {
    const token = createSessionToken(PUBLIC_KEY, 'access', -1);
    expect(verifySessionToken(token, 'access')).toBeNull();
  });

  it('rejects a token of the wrong type', () => {
    const refreshToken = createSessionToken(
      PUBLIC_KEY,
      'refresh',
      DEFAULT_REFRESH_TTL_SEC,
    );
    expect(verifySessionToken(refreshToken, 'access')).toBeNull();
  });

  it('rejects a malformed token', () => {
    expect(verifySessionToken('not-a-real-token', 'access')).toBeNull();
    expect(verifySessionToken('', 'access')).toBeNull();
    expect(verifySessionToken('a.b.c', 'access')).toBeNull();
  });

  it('rejects when SESSION_SECRET is not configured', () => {
    const original = process.env.SESSION_SECRET;
    delete process.env.SESSION_SECRET;
    try {
      expect(() =>
        createSessionToken(PUBLIC_KEY, 'access', ACCESS_TOKEN_TTL_SEC),
      ).toThrow('SESSION_SECRET is not configured');
    } finally {
      process.env.SESSION_SECRET = original;
    }
  });
});

describe('getSessionWallet', () => {
  function requestWithCookie(cookieHeader?: string): NextRequest {
    const headers: Record<string, string> = {};
    if (cookieHeader) headers['cookie'] = cookieHeader;
    return new NextRequest('http://localhost:3000/', { headers });
  }

  it('returns null when there is no session cookie', () => {
    expect(getSessionWallet(requestWithCookie())).toBeNull();
  });

  it('returns the public key for a valid access token', () => {
    const token = createSessionToken(
      PUBLIC_KEY,
      'access',
      ACCESS_TOKEN_TTL_SEC,
    );
    expect(getSessionWallet(requestWithCookie(`session=${token}`))).toBe(
      PUBLIC_KEY,
    );
  });

  it('returns null for a forged raw-address cookie (see #778)', () => {
    expect(
      getSessionWallet(requestWithCookie(`session=${PUBLIC_KEY}`)),
    ).toBeNull();
  });

  it('returns null for an expired access token', () => {
    const token = createSessionToken(PUBLIC_KEY, 'access', -1);
    expect(getSessionWallet(requestWithCookie(`session=${token}`))).toBeNull();
  });

  it('returns null when a refresh token is presented as the session cookie', () => {
    const refreshToken = createSessionToken(
      PUBLIC_KEY,
      'refresh',
      DEFAULT_REFRESH_TTL_SEC,
    );
    expect(
      getSessionWallet(requestWithCookie(`session=${refreshToken}`)),
    ).toBeNull();
  });
});
