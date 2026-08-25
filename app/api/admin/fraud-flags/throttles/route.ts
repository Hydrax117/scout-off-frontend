import { NextRequest, NextResponse } from 'next/server';
import { requireAdminWallet } from '@/lib/adminAuth';
import { FraudThrottleStore } from '@/lib/fraudThrottleStore';

/**
 * Admin-auditable trail for wallet throttles placed by lib/fraudFlagsRunner.ts's
 * applyAutoThrottles (issue #1174). Returns full history — active and
 * lifted — most recently placed first, so FraudFlagsPanel.tsx can render
 * both "currently throttled" and "previously throttled, since lifted"
 * sections from one call.
 */
export async function GET(req: NextRequest) {
  const sessionWallet = requireAdminWallet(req);
  if (!sessionWallet) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const throttles = FraudThrottleStore.getInstance().listAll();
  return NextResponse.json({ throttles });
}
