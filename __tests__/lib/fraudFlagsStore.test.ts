/**
 * @jest-environment node
 */
import { FraudFlagsStore } from '@/lib/fraudFlagsStore';
import type { FraudFlag } from '@/types';

function flag(severity: FraudFlag['severity'], id: string): FraudFlag {
  return {
    id,
    category: 'referral',
    heuristic: 'test',
    severity,
    wallets: ['GSOMEONE'],
    reason: 'test reason',
    evidence: {},
  };
}

let store: FraudFlagsStore;

beforeEach(() => {
  FraudFlagsStore.resetInstance();
  store = FraudFlagsStore.getInstance();
});

afterEach(() => {
  FraudFlagsStore.resetInstance();
});

describe('FraudFlagsStore', () => {
  it('is a singleton', () => {
    expect(FraudFlagsStore.getInstance()).toBe(store);
  });

  it('returns null when no run has been recorded yet', () => {
    expect(store.getLatestRun()).toBeNull();
  });

  it('persists a run and returns it as the latest', () => {
    const flags = [flag('high', 'a'), flag('low', 'b')];
    const run = store.recordRun('manual', flags, ['warn'], 1_700_000_000);

    expect(run.trigger).toBe('manual');
    expect(run.highSeverityCount).toBe(1);
    expect(run.flags).toEqual(flags);
    expect(run.warnings).toEqual(['warn']);

    const latest = store.getLatestRun();
    expect(latest).toEqual(run);
  });

  it('getLatestRun returns the most recently evaluated run, not just the last inserted id', () => {
    store.recordRun('cron', [], [], 1_000);
    const newer = store.recordRun('manual', [flag('high', 'x')], [], 2_000);

    const latest = store.getLatestRun();
    expect(latest?.evaluatedAt).toBe(2_000);
    expect(latest?.trigger).toBe('manual');
    expect(latest?.id).toBe(newer.id);
  });
});
