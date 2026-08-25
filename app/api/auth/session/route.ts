import { NextRequest, NextResponse } from 'next/server';
import { getSessionWallet } from '@/lib/session';

// better-sqlite3 (via lib/session.ts's SessionStore lookup) is a native
// addon and needs the Node.js runtime, not edge.
export const runtime = 'nodejs';

/**
 * GET /api/auth/session
 *
 * Returns the caller's authentication state based on the `session` cookie.
 * The cookie is a signed, time-bound access token (see lib/session.ts).
 * This route delegates to getSessionWallet() rather than trusting the
 * cookie's value directly, so a caller can no longer authenticate as an
 * arbitrary address just by setting `session=<any-address>` by hand (see
 * #778) — and, per #1179, a revoked session is reported as unauthenticated
 * even before its cookie's natural expiry, since getSessionWallet checks
 * the server-side session store in addition to the token's signature.
 *
 * Rate limiting: max 30 requests per IP per 10 seconds. This is a cheap,
 * low-risk read (it just echoes back a cookie), so the limit is generous
 * relative to app/api/players/search/route.ts's 20/10s — it's
 * defense-in-depth against abuse/runaway polling rather than a tight
 * bottleneck on legitimate session checks. When exceeded, responds with
 * 429 Too Many Requests and a Retry-After header.
 *
 * Real client IP is extracted from the x-forwarded-for header, same
 * convention as app/api/players/search/route.ts and
 * app/api/ipfs/upload/route.ts.
 */
const RATE_LIMIT = 30;
const WINDOW_MS = 10 * 1000;

type RateEntry = { count: number; firstSeen: number };
const ipRateMap = new Map<string, RateEntry>();

function getClientIp(req: NextRequest): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  const realIp = req.headers.get('x-real-ip');
  if (realIp) return realIp;
  return 'unknown';
}

function checkRateLimit(ip: string): {
  limited: boolean;
  retryAfterSec?: number;
} {
  const now = Date.now();
  const entry = ipRateMap.get(ip);
  if (!entry) {
    ipRateMap.set(ip, { count: 1, firstSeen: now });
    return { limited: false };
  }

  if (now - entry.firstSeen > WINDOW_MS) {
    ipRateMap.set(ip, { count: 1, firstSeen: now });
    return { limited: false };
  }

  entry.count += 1;
  ipRateMap.set(ip, entry);

  if (entry.count > RATE_LIMIT) {
    const retryAfterSec = Math.ceil(
      (WINDOW_MS - (now - entry.firstSeen)) / 1000,
    );
    return { limited: true, retryAfterSec };
  }

  return { limited: false };
}

export async function GET(req: NextRequest) {
  const ip = getClientIp(req);

  const rl = checkRateLimit(ip);
  if (rl.limited) {
    console.warn(`[session rate limit] Too many requests from IP: ${ip}`);
    const retryAfter = rl.retryAfterSec ?? Math.ceil(WINDOW_MS / 1000);
    return NextResponse.json(
      { error: 'Too many requests. Please slow down.' },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } },
    );
  }

  const wallet = getSessionWallet(req);

  if (!wallet) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  return NextResponse.json({
    authenticated: true,
    publicKey: wallet,
  });
}
