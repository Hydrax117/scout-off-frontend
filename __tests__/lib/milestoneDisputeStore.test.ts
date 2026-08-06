/**
 * @jest-environment node
 */
import {
  MilestoneDisputeStore,
  DuplicateDisputeError,
  type CreateDisputeInput,
} from '@/lib/milestoneDisputeStore';

function makeInput(
  overrides: Partial<CreateDisputeInput> = {},
): CreateDisputeInput {
  return {
    playerId: 'player-1',
    playerWallet: 'GPLAYER',
    milestoneId: 'milestone-1',
    milestoneDescription: 'Scored a hat-trick',
    reason: 'Evidence is inconclusive',
    ...overrides,
  };
}

let store: MilestoneDisputeStore;

beforeEach(() => {
  MilestoneDisputeStore.resetInstance();
  store = MilestoneDisputeStore.getInstance();
});

afterEach(() => {
  MilestoneDisputeStore.resetInstance();
});

describe('MilestoneDisputeStore', () => {
  it('is a singleton', () => {
    const a = MilestoneDisputeStore.getInstance();
    const b = MilestoneDisputeStore.getInstance();
    expect(a).toBe(b);
  });

  it('creates a dispute with status pending and returns it', () => {
    const dispute = store.create(makeInput());

    expect(dispute).toMatchObject({
      playerId: 'player-1',
      playerWallet: 'GPLAYER',
      milestoneId: 'milestone-1',
      milestoneDescription: 'Scored a hat-trick',
      reason: 'Evidence is inconclusive',
      status: 'pending',
      decidedAt: null,
      decidedBy: null,
      resolutionNote: null,
      revokeTxHash: null,
    });
    expect(typeof dispute.id).toBe('number');
    expect(typeof dispute.createdAt).toBe('number');
  });

  it('throws DuplicateDisputeError when the milestone already has a pending dispute', () => {
    store.create(makeInput());

    expect(() => store.create(makeInput())).toThrow(DuplicateDisputeError);
    expect(() => store.create(makeInput())).toThrow(
      'Milestone milestone-1 already has a pending dispute',
    );
  });

  it('allows re-disputing a milestone once its prior dispute has been decided', () => {
    const first = store.create(makeInput());
    store.decide(first.id, {
      status: 'upheld',
      decidedBy: 'GADMIN',
      resolutionNote: 'No issue found',
      revokeTxHash: null,
    });

    const second = store.create(makeInput());
    expect(second.id).not.toBe(first.id);
    expect(second.status).toBe('pending');
  });

  it('findById returns undefined for a non-existent id', () => {
    expect(store.findById(999)).toBeUndefined();
  });

  it('findById returns the matching dispute', () => {
    const created = store.create(makeInput());
    expect(store.findById(created.id)).toEqual(created);
  });

  it('listForWallet returns only disputes for that wallet, newest first', () => {
    store.create(makeInput({ playerWallet: 'GPLAYER_A', milestoneId: 'm1' }));
    store.create(makeInput({ playerWallet: 'GPLAYER_B', milestoneId: 'm2' }));
    store.create(makeInput({ playerWallet: 'GPLAYER_A', milestoneId: 'm3' }));

    const walletADisputes = store.listForWallet('GPLAYER_A');
    expect(walletADisputes).toHaveLength(2);
    expect(walletADisputes.every((d) => d.playerWallet === 'GPLAYER_A')).toBe(
      true,
    );
  });

  it('listForWallet returns an empty array for a wallet with no disputes', () => {
    expect(store.listForWallet('GNOBODY')).toEqual([]);
  });

  it('listAll with no filter returns every dispute, newest first', () => {
    store.create(makeInput({ milestoneId: 'm1' }));
    store.create(makeInput({ milestoneId: 'm2' }));

    expect(store.listAll()).toHaveLength(2);
  });

  it('listAll filters by status', () => {
    const d1 = store.create(makeInput({ milestoneId: 'm1' }));
    store.create(makeInput({ milestoneId: 'm2' }));
    store.decide(d1.id, {
      status: 'reversed',
      decidedBy: 'GADMIN',
      resolutionNote: 'Confirmed invalid',
      revokeTxHash: 'txhash123',
    });

    const reversed = store.listAll('reversed');
    expect(reversed).toHaveLength(1);
    expect(reversed[0].id).toBe(d1.id);

    const pending = store.listAll('pending');
    expect(pending).toHaveLength(1);
    expect(pending[0].milestoneId).toBe('m2');
  });

  it('decide updates status, decidedAt, decidedBy, resolutionNote, and revokeTxHash', () => {
    const dispute = store.create(makeInput());

    const decided = store.decide(dispute.id, {
      status: 'reversed',
      decidedBy: 'GADMIN',
      resolutionNote: 'Milestone revoked on-chain',
      revokeTxHash: 'abcd1234',
    });

    expect(decided.status).toBe('reversed');
    expect(decided.decidedBy).toBe('GADMIN');
    expect(decided.resolutionNote).toBe('Milestone revoked on-chain');
    expect(decided.revokeTxHash).toBe('abcd1234');
    expect(typeof decided.decidedAt).toBe('number');
  });

  it('decide throws when the dispute id does not exist', () => {
    expect(() =>
      store.decide(999, {
        status: 'upheld',
        decidedBy: 'GADMIN',
        resolutionNote: null,
        revokeTxHash: null,
      }),
    ).toThrow('Dispute 999 not found');
  });
});
