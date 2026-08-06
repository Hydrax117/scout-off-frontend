const mockPost = jest.fn();
const mockDelete = jest.fn();

jest.mock('@/lib/messaging/chatApi', () => ({
  __esModule: true,
  default: {
    post: (...args: unknown[]) => mockPost(...args),
    delete: (...args: unknown[]) => mockDelete(...args),
  },
}));

import {
  reportUser,
  blockUser,
  unblockUser,
  getBlockedUsers,
  isUserBlocked,
  type BlockedUser,
} from '@/lib/messaging/moderation';

const BLOCKED_USERS_KEY = 'scoutoff_blocked_users';

beforeEach(() => {
  mockPost.mockReset();
  mockDelete.mockReset();
  mockPost.mockResolvedValue(undefined);
  mockDelete.mockResolvedValue(undefined);
  window.localStorage.clear();
});

describe('reportUser', () => {
  it('posts a moderation report with threadId, counterpartId, and reason', async () => {
    await reportUser('thread-1', 'user-2', 'spam');

    expect(mockPost).toHaveBeenCalledWith('/moderation/reports', {
      threadId: 'thread-1',
      counterpartId: 'user-2',
      reason: 'spam',
    });
  });
});

describe('blockUser', () => {
  it('posts a block request and persists the blocked user locally', async () => {
    await blockUser('user-2');

    expect(mockPost).toHaveBeenCalledWith('/moderation/blocks', {
      counterpartId: 'user-2',
    });
    const stored: BlockedUser[] = JSON.parse(
      window.localStorage.getItem(BLOCKED_USERS_KEY) ?? '[]',
    );
    expect(stored).toHaveLength(1);
    expect(stored[0].userId).toBe('user-2');
    expect(typeof stored[0].blockedAt).toBe('string');
  });

  it('does not duplicate an already-blocked user', async () => {
    await blockUser('user-2');
    await blockUser('user-2');

    const stored = getBlockedUsers();
    expect(stored).toHaveLength(1);
  });

  it('can accumulate multiple distinct blocked users', async () => {
    await blockUser('user-2');
    await blockUser('user-3');

    const stored = getBlockedUsers();
    expect(stored.map((b) => b.userId).sort()).toEqual(['user-2', 'user-3']);
  });
});

describe('unblockUser', () => {
  it('deletes the block server-side and removes it from local storage', async () => {
    await blockUser('user-2');
    await blockUser('user-3');

    await unblockUser('user-2');

    expect(mockDelete).toHaveBeenCalledWith('/moderation/blocks/user-2');
    const stored = getBlockedUsers();
    expect(stored.map((b) => b.userId)).toEqual(['user-3']);
  });

  it('is a no-op locally when unblocking a user that was never blocked', async () => {
    await unblockUser('ghost-user');

    expect(mockDelete).toHaveBeenCalledWith('/moderation/blocks/ghost-user');
    expect(getBlockedUsers()).toEqual([]);
  });
});

describe('getBlockedUsers', () => {
  it('returns an empty array when nothing is stored', () => {
    expect(getBlockedUsers()).toEqual([]);
  });

  it('returns an empty array when localStorage contains invalid JSON', () => {
    window.localStorage.setItem(BLOCKED_USERS_KEY, 'not-json{{{');
    expect(getBlockedUsers()).toEqual([]);
  });
});

describe('isUserBlocked', () => {
  it('returns true for a blocked user', async () => {
    await blockUser('user-2');
    expect(isUserBlocked('user-2')).toBe(true);
  });

  it('returns false for a user that is not blocked', async () => {
    await blockUser('user-2');
    expect(isUserBlocked('user-3')).toBe(false);
  });
});
