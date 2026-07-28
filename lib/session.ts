import { NextRequest } from 'next/server';

/**
 * Returns the authenticated wallet's public key from `req`'s session cookie,
 * or null if unauthenticated. Same cookie read GET /api/auth/session already
 * performs inline, and that lib/adminAuth.ts's requireAdminWallet further
 * restricts to the configured admin address — factored out here for routes
 * that just need "is someone logged in, and who."
 */
export function getSessionWallet(req: NextRequest): string | null {
  return req.cookies.get('session')?.value ?? null;
}
