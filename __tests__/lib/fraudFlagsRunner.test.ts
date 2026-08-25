/**
 * @jest-environment node
 */
import { runFraudFlagEvaluation } from '@/lib/fraudFlagsRunner';
import { FraudThrottleStore } from '@/lib/fraudThrottleStore';
import { clearFeatureFlagCache } from '@/lib/featureFlags';
import type { ReferralCode } from '@/types';

jest.mock('@/lib/api', () => ({
  fetchAllReferralCodes: jest.fn(),
  fetchActivityEvents: jest.fn(),
}));

import { fetchAllReferralCodes, fetchActivityEvents } from '@/lib/api';

const mockedFetchAllReferralCodes = fetchAllReferralCodes as jest.Mock;
const mockedFetchActivityEvents = fetchActivityEvents as jest.Mock;

/** A redeemer wallet that redeemed codes from 8 distinct scouts — crosses
 * RING_MIN_DISTINCT_SCOUTS * 2, so cross_scout_redeemer_ring reaches 'high'. */
function ringCodes(redeemer: string, scoutCount: number): ReferralCode[] {
  return Array.from({ length: scoutCount }, (_, i) => ({
    code: `CODE-${i}`,
    scoutWallet: `GSCOUT${i}`,
    createdAt: 0,
    usedBy: redeemer,
    usedAt: 1,
  }));
}

describe('runFraudFlagEvaluation — auto-throttle (issue #1174)', () => {
  const originalEnv = process.env.NEXT_PUBLIC_FEATURE_FRAUD_AUTO_THROTTLE;

  beforeEach(() => {
    FraudThrottleStore.resetInstance();
    clearFeatureFlagCache();
    mockedFetchAllReferralCodes.mockResolvedValue(ringCodes('GRING', 8));
    mockedFetchActivityEvents.mockResolvedValue({ events: [], total: 0 });
  });

  afterEach(() => {
    FraudThrottleStore.resetInstance();
    process.env.NEXT_PUBLIC_FEATURE_FRAUD_AUTO_THROTTLE = originalEnv;
    clearFeatureFlagCache();
  });

  it('does not throttle anything when the feature flag is off', async () => {
    process.env.NEXT_PUBLIC_FEATURE_FRAUD_AUTO_THROTTLE = '0';
    clearFeatureFlagCache();

    const { flags } = await runFraudFlagEvaluation();
    expect(flags.some((f) => f.heuristic === 'cross_scout_redeemer_ring')).toBe(
      true,
    );
    expect(FraudThrottleStore.getInstance().listAll()).toHaveLength(0);
  });

  it('throttles the redeemer wallet for a high-severity cross_scout_redeemer_ring flag when enabled', async () => {
    process.env.NEXT_PUBLIC_FEATURE_FRAUD_AUTO_THROTTLE = '1';
    clearFeatureFlagCache();

    await runFraudFlagEvaluation();

    const active = FraudThrottleStore.getInstance().getActiveThrottle('GRING');
    expect(active).not.toBeNull();
    expect(active?.heuristic).toBe('cross_scout_redeemer_ring');
    expect(active?.status).toBe('throttled');
    expect(active?.liftedAt).toBeNull();
  });

  it('never throttles subscription_cycling, even at high confidence', async () => {
    process.env.NEXT_PUBLIC_FEATURE_FRAUD_AUTO_THROTTLE = '1';
    clearFeatureFlagCache();
    mockedFetchAllReferralCodes.mockResolvedValue([]);
    mockedFetchActivityEvents.mockResolvedValue({
      total: 10,
      events: [
        ...Array.from({ length: 5 }, (_, i) => ({
          id: `sub-${i}`,
          type: 'scout_subscribed' as const,
          actor: 'GCYCLER',
          timestamp: i * 1000,
        })),
        {
          id: 'contact-1',
          type: 'player_contacted' as const,
          actor: 'GCYCLER',
          timestamp: 1,
        },
      ],
    });

    const { flags } = await runFraudFlagEvaluation();
    expect(flags.some((f) => f.heuristic === 'subscription_cycling')).toBe(
      true,
    );
    expect(FraudThrottleStore.getInstance().listAll()).toHaveLength(0);
  });
});
