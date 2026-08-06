/**
 * Unit tests for lib/offlineQueue.ts
 *
 * offlineQueue.ts is backed by IndexedDB, which jsdom does not implement.
 * `fake-indexeddb/auto` installs an in-memory IndexedDB implementation on
 * the global object before the module under test is imported, so the real
 * (unmocked) module code — including the `onupgradeneeded` object-store
 * creation path — runs against a working, spec-compliant IndexedDB.
 */
import 'fake-indexeddb/auto';

// jest-environment-jsdom does not expose Node's global `structuredClone` on
// the jsdom global object, but fake-indexeddb uses it to clone values on
// insertion (mirroring real IndexedDB's structured-clone storage semantics).
if (typeof (globalThis as any).structuredClone !== 'function') {
  (globalThis as any).structuredClone = (value: unknown) =>
    JSON.parse(JSON.stringify(value));
}

import {
  enqueueAction,
  getQueuedActions,
  removeAction,
  markRetry,
  getQueueLength,
  registerHandler,
  processQueue,
  hasQueuedActions,
} from '@/lib/offlineQueue';

// The module caches its IDBDatabase connection in a module-level variable,
// and registered handlers live in a module-level Map — both persist across
// tests in this file. Draining the queue after each test (rather than
// resetting modules, which would also drop the cached db connection and
// re-trigger onupgradeneeded) keeps tests independent without fighting the
// module's intentional singleton-connection design.
async function drainQueue(): Promise<void> {
  const actions = await getQueuedActions();
  for (const action of actions) {
    await removeAction(action.id);
  }
}

afterEach(async () => {
  await drainQueue();
});

describe('enqueueAction', () => {
  it('returns a generated id prefixed with the action type', async () => {
    const id = await enqueueAction('update_profile', { name: 'Ada' });
    expect(id).toMatch(/^update_profile_\d+_[a-z0-9]+$/);
  });

  it('persists the action so it shows up in getQueuedActions', async () => {
    const id = await enqueueAction('update_profile', { name: 'Ada' });
    const actions = await getQueuedActions();
    expect(actions).toHaveLength(1);
    expect(actions[0]).toMatchObject({
      id,
      type: 'update_profile',
      payload: { name: 'Ada' },
      retryCount: 0,
    });
    expect(typeof actions[0].queuedAt).toBe('number');
  });

  it('assigns distinct ids to successive enqueues of the same type', async () => {
    const id1 = await enqueueAction('submit_comment', { text: 'a' });
    const id2 = await enqueueAction('submit_comment', { text: 'b' });
    expect(id1).not.toBe(id2);
  });
});

describe('getQueuedActions', () => {
  it('returns an empty array when nothing is queued', async () => {
    await expect(getQueuedActions()).resolves.toEqual([]);
  });

  it('returns actions sorted non-decreasing by queuedAt', async () => {
    await enqueueAction('type_a', { n: 1 });
    await enqueueAction('type_b', { n: 2 });
    await enqueueAction('type_c', { n: 3 });

    const actions = await getQueuedActions();
    // Enqueues that land in the same millisecond are not guaranteed to be
    // returned in insertion order (the index only guarantees queuedAt is
    // non-decreasing), so assert membership rather than exact order.
    expect(actions.map((a) => a.type).sort()).toEqual([
      'type_a',
      'type_b',
      'type_c',
    ]);
    for (let i = 1; i < actions.length; i++) {
      expect(actions[i].queuedAt).toBeGreaterThanOrEqual(
        actions[i - 1].queuedAt,
      );
    }
  });
});

describe('removeAction', () => {
  it('removes the matching action from the queue', async () => {
    const id1 = await enqueueAction('type_a', {});
    const id2 = await enqueueAction('type_b', {});

    await removeAction(id1);

    const remaining = await getQueuedActions();
    expect(remaining.map((a) => a.id)).toEqual([id2]);
  });

  it('resolves without throwing when the id does not exist', async () => {
    await expect(removeAction('nonexistent-id')).resolves.toBeUndefined();
  });
});

describe('markRetry', () => {
  it('increments retryCount for the matching action', async () => {
    const id = await enqueueAction('type_a', {});

    await markRetry(id);

    const [action] = await getQueuedActions();
    expect(action.retryCount).toBe(1);
  });

  it('increments again on a second call', async () => {
    const id = await enqueueAction('type_a', {});

    await markRetry(id);
    await markRetry(id);

    const [action] = await getQueuedActions();
    expect(action.retryCount).toBe(2);
  });

  it('resolves without throwing when the id does not exist', async () => {
    await expect(markRetry('nonexistent-id')).resolves.toBeUndefined();
  });
});

describe('getQueueLength', () => {
  it('returns 0 for an empty queue', async () => {
    await expect(getQueueLength()).resolves.toBe(0);
  });

  it('returns the number of queued actions', async () => {
    await enqueueAction('type_a', {});
    await enqueueAction('type_b', {});

    await expect(getQueueLength()).resolves.toBe(2);
  });
});

describe('hasQueuedActions', () => {
  it('returns false for an empty queue', async () => {
    await expect(hasQueuedActions()).resolves.toBe(false);
  });

  it('returns true when at least one action is queued', async () => {
    await enqueueAction('type_a', {});
    await expect(hasQueuedActions()).resolves.toBe(true);
  });
});

describe('registerHandler / processQueue', () => {
  it('processes a queued action with a registered handler and removes it', async () => {
    const handler = jest.fn().mockResolvedValue(undefined);
    registerHandler('process_success', handler);

    await enqueueAction('process_success', { foo: 'bar' });
    const processed = await processQueue();

    expect(processed).toBe(1);
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'process_success',
        payload: { foo: 'bar' },
      }),
    );
    await expect(getQueuedActions()).resolves.toEqual([]);
  });

  it('skips actions whose type has no registered handler', async () => {
    await enqueueAction('no_handler_registered_type', {});
    const processed = await processQueue();

    expect(processed).toBe(0);
    // Unhandled actions stay in the queue for a future retry once a handler exists.
    const remaining = await getQueuedActions();
    expect(remaining).toHaveLength(1);
  });

  it('marks the action for retry and stops processing on handler failure', async () => {
    const failingHandler = jest
      .fn()
      .mockRejectedValue(new Error('network down'));
    registerHandler('process_failure', failingHandler);

    const id1 = await enqueueAction('process_failure', {});
    const id2 = await enqueueAction('process_failure', {});

    const processed = await processQueue();

    expect(processed).toBe(0);
    expect(failingHandler).toHaveBeenCalledTimes(1);

    const remaining = await getQueuedActions();
    // Both actions remain — processing stopped after the first failure so
    // the second is never attempted. (Enqueue order among same-millisecond
    // entries isn't guaranteed, so compare ids as a set rather than which
    // of id1/id2 was processed first.)
    expect(remaining.map((a) => a.id).sort()).toEqual([id1, id2].sort());
    const retryCounts = remaining.map((a) => a.retryCount).sort();
    // Exactly one action was attempted (and had its retry count bumped);
    // the other was never reached.
    expect(retryCounts).toEqual([0, 1]);
  });

  it('processes multiple successful actions in order', async () => {
    const handler = jest.fn().mockResolvedValue(undefined);
    registerHandler('process_multi', handler);

    await enqueueAction('process_multi', { n: 1 });
    await enqueueAction('process_multi', { n: 2 });

    const processed = await processQueue();

    expect(processed).toBe(2);
    expect(handler).toHaveBeenCalledTimes(2);
    await expect(getQueuedActions()).resolves.toEqual([]);
  });

  it('returns 0 when the queue is empty', async () => {
    await expect(processQueue()).resolves.toBe(0);
  });
});
