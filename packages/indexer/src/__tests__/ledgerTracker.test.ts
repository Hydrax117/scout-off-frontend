/**
 * @jest-environment node
 */
import {
  updateLastLedger,
  updateNetworkLedger,
  getLastLedgerInfo,
  getLedgerLag,
  resetLedgerState,
} from '../ledgerTracker';

beforeEach(() => {
  resetLedgerState();
});

afterEach(() => {
  resetLedgerState();
});

// ── updateLastLedger / getLastLedgerInfo ──────────────────────────────────────

describe('updateLastLedger', () => {
  test('sets lastLedger to the given sequence', () => {
    updateLastLedger(500);
    expect(getLastLedgerInfo().lastLedger).toBe(500);
  });

  test('sets timestamp to a recent Unix ms value', () => {
    const before = Date.now();
    updateLastLedger(500);
    const after = Date.now();
    const { timestamp } = getLastLedgerInfo();
    expect(timestamp).toBeGreaterThanOrEqual(before);
    expect(timestamp).toBeLessThanOrEqual(after);
  });

  test('overwrites a previous value on a second call', () => {
    updateLastLedger(100);
    updateLastLedger(200);
    expect(getLastLedgerInfo().lastLedger).toBe(200);
  });
});

describe('getLastLedgerInfo', () => {
  test('returns lastLedger:0 and timestamp:0 before any update', () => {
    const info = getLastLedgerInfo();
    expect(info.lastLedger).toBe(0);
    expect(info.timestamp).toBe(0);
  });

  test('returns a fresh copy, not a live reference to internal state', () => {
    updateLastLedger(10);
    const info = getLastLedgerInfo();
    info.lastLedger = 999999;
    expect(getLastLedgerInfo().lastLedger).toBe(10);
  });

  test('includes networkLedger alongside lastLedger and timestamp', () => {
    updateNetworkLedger(42);
    expect(getLastLedgerInfo().networkLedger).toBe(42);
  });
});

// ── updateNetworkLedger ────────────────────────────────────────────────────────

describe('updateNetworkLedger', () => {
  test('sets networkLedger to the given sequence', () => {
    updateNetworkLedger(777);
    expect(getLastLedgerInfo().networkLedger).toBe(777);
  });

  test('does not affect lastLedger or timestamp', () => {
    updateLastLedger(100);
    const { timestamp: timestampBefore } = getLastLedgerInfo();
    updateNetworkLedger(200);
    const info = getLastLedgerInfo();
    expect(info.lastLedger).toBe(100);
    expect(info.timestamp).toBe(timestampBefore);
  });
});

// ── getLedgerLag ───────────────────────────────────────────────────────────────

describe('getLedgerLag', () => {
  test('returns 0 when neither ledger value has ever been set', () => {
    expect(getLedgerLag()).toBe(0);
  });

  test('returns 0 when only networkLedger is unknown (still 0)', () => {
    updateLastLedger(100);
    expect(getLedgerLag()).toBe(0);
  });

  test('returns 0 when only lastLedger is unknown (still 0)', () => {
    updateNetworkLedger(100);
    expect(getLedgerLag()).toBe(0);
  });

  test('computes the correct positive difference in the normal case', () => {
    updateNetworkLedger(1050);
    updateLastLedger(1000);
    expect(getLedgerLag()).toBe(50);
  });

  test('returns 0 when both ledgers are equal (fully caught up)', () => {
    updateNetworkLedger(500);
    updateLastLedger(500);
    expect(getLedgerLag()).toBe(0);
  });

  test('clamps to 0 rather than going negative if lastLedger exceeds networkLedger', () => {
    updateNetworkLedger(100);
    updateLastLedger(150);
    expect(getLedgerLag()).toBe(0);
  });
});

// ── resetLedgerState ───────────────────────────────────────────────────────────

describe('resetLedgerState', () => {
  test('resets lastLedger, timestamp, and networkLedger all to 0', () => {
    updateLastLedger(100);
    updateNetworkLedger(200);

    resetLedgerState();

    const info = getLastLedgerInfo();
    expect(info.lastLedger).toBe(0);
    expect(info.timestamp).toBe(0);
    expect(info.networkLedger).toBe(0);
  });

  test('getLedgerLag returns 0 immediately after a reset', () => {
    updateNetworkLedger(1000);
    updateLastLedger(900);
    expect(getLedgerLag()).toBe(100);

    resetLedgerState();

    expect(getLedgerLag()).toBe(0);
  });
});

// ── checkpoint persistence behavior ───────────────────────────────────────────

describe('checkpoint persistence behavior', () => {
  test('checkpoint value persists across multiple getLastLedgerInfo() calls', () => {
    updateLastLedger(450);
    const first = getLastLedgerInfo();
    const second = getLastLedgerInfo();
    expect(first.lastLedger).toBe(450);
    expect(second.lastLedger).toBe(450);
  });

  test('saving a new checkpoint overwrites the previous one (simulates restart with persisted state)', () => {
    updateLastLedger(100);
    // Simulate re-load by writing a new checkpoint value
    updateLastLedger(200);
    expect(getLastLedgerInfo().lastLedger).toBe(200);
  });

  test('default checkpoint is 0 when no checkpoint has been saved (fresh start)', () => {
    // resetLedgerState() is called in beforeEach, so this is a clean slate
    expect(getLastLedgerInfo().lastLedger).toBe(0);
  });

  test('both lastLedger and networkLedger checkpoints are independent', () => {
    updateLastLedger(500);
    updateNetworkLedger(550);
    const info = getLastLedgerInfo();
    expect(info.lastLedger).toBe(500);
    expect(info.networkLedger).toBe(550);
  });
});