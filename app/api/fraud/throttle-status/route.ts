import { NextRequest, NextResponse } from 'next/server';
import { isFeatureEnabled } from '@/lib/featureFlags';
import { FraudThrottleStore } from '@/lib/fraudThrottleStore';

/**
 * GET /api/fraud/throttle-status?wallet=<address>
 *
 * Enforcement checkpoint for issue #1174's admin-gated auto-throttling —
 * called by hooks/usePayToContact.ts and lib/api.ts's redeemReferralCode
 * before submitting, so a throttled wallet is rejected with a clear message
 * rather than a silent or generic failure. Intentionally unauthenticated
 * (a wallet checking its own throttle status pre-submission has no admin
 * session): only exposes a boolean, never the underlying heuristic/evidence,
 * which stays admin-only via GET /api/admin/fraud-flags/throttles.
 *
 * Always returns { throttled: false } when the feature flag is off, so this
 * check is a true no-op — including no store hit — until an admin has
 * validated thresholds against real traffic and enabled it.
 */
export async function GET(req: NextRequest) {
  const wallet = req.nextUrl.searchParams.get('wallet');
  if (!wallet) {
    return NextResponse.json({ error: 'wallet is required' }, { status: 400 });
  }

  if (!isFeatureEnabled('FRAUD_AUTO_THROTTLE')) {
    return NextResponse.json({ throttled: false });
  }

  const active = FraudThrottleStore.getInstance().getActiveThrottle(wallet);
  return NextResponse.json({ throttled: active !== null });
}
