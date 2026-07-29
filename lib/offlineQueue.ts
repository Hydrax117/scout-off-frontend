/**
 * Offline Queue — IndexedDB-backed queue for non-financial, idempotent-safe
 * form submissions that should not fail when the network is unavailable.
 *
 * When a submission is attempted while offline, it is persisted locally and
 * automatically retried once connectivity is restored.
 *
 * **Scope**: profile updates, text submissions, and other idempotent-safe
 * actions. **Not** for signed blockchain transactions.
 */

// ── Types ───────────────────────────────────────────────────────────────────

export interface QueuedAction {
  /** Unique id assigned at enqueue time. */
  id: string;
  /** When the action was first queued (Unix ms). */
  queuedAt: number;
  /** Number of retry attempts so far. */
  retryCount: number;
  /** The action type, used to dispatch to the right handler. */
  type: string;
  /** Opaque payload — structure depends on the action type. */
  payload: unknown;
}

export type QueueStatus = 'idle' | 'processing' | 'queued';

type ActionHandler = (action: QueuedAction) => Promise<void>;

// ── Database ─────────────────────────────────────────────────────────────────

const DB_NAME = 'scoutoff-offline-queue';
const DB_VERSION = 1;
const STORE_NAME = 'actions';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, {
          keyPath: 'id',
        });
        store.createIndex('queuedAt', 'queuedAt', { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// ── Queue operations ─────────────────────────────────────────────────────────

let dbPromise: Promise<IDBDatabase> | null = null;

async function getDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = openDb();
  }
  return dbPromise;
}

/**
 * Enqueues an action to be retried when connectivity returns.
 *
 * @param type - A stable string identifying the action type (e.g. `'update_profile'`).
 * @param payload - Arbitrary JSON-serialisable payload.
 * @returns The id of the newly queued action.
 */
export async function enqueueAction(
  type: string,
  payload: unknown,
): Promise<string> {
  const db = await getDb();
  const action: QueuedAction = {
    id: `${type}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    queuedAt: Date.now(),
    retryCount: 0,
    type,
    payload,
  };

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).add(action);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });

  return action.id;
}

/**
 * Returns all currently queued actions (oldest first).
 */
export async function getQueuedActions(): Promise<QueuedAction[]> {
  const db = await getDb();
  const actions: QueuedAction[] = [];

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const index = tx.objectStore(STORE_NAME).index('queuedAt');
    const cursor = index.openCursor(null, 'next');

    cursor.onsuccess = () => {
      if (cursor.result) {
        actions.push(cursor.result.value);
        cursor.result.continue();
      } else {
        resolve();
      }
    };
    cursor.onerror = () => reject(cursor.error);
  });

  return actions;
}

/**
 * Removes an action from the queue after successful processing.
 */
export async function removeAction(id: string): Promise<void> {
  const db = await getDb();

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Increments the retry count for an action.
 */
export async function markRetry(id: string): Promise<void> {
  const db = await getDb();

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const get = store.get(id);

    get.onsuccess = () => {
      const action = get.result;
      if (action) {
        action.retryCount += 1;
        store.put(action);
      }
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Returns the count of queued actions.
 */
export async function getQueueLength(): Promise<number> {
  const actions = await getQueuedActions();
  return actions.length;
}

// ── Processing ───────────────────────────────────────────────────────────────

const handlers = new Map<string, ActionHandler>();

/**
 * Registers a handler for a specific action type.
 * Handlers are called in the order actions were enqueued.
 */
export function registerHandler(type: string, handler: ActionHandler): void {
  handlers.set(type, handler);
}

/**
 * Processes all currently queued actions (oldest first). Skips actions whose
 * type has no registered handler. Removes successfully processed actions.
 *
 * @returns The number of successfully processed actions.
 */
export async function processQueue(): Promise<number> {
  const actions = await getQueuedActions();
  let processed = 0;

  for (const action of actions) {
    const handler = handlers.get(action.type);
    if (!handler) continue;

    try {
      await handler(action);
      await removeAction(action.id);
      processed++;
    } catch {
      await markRetry(action.id);
      // Stop processing on first failure so earlier actions aren't starved
      break;
    }
  }

  return processed;
}

/**
 * Checks whether any actions are currently queued.
 */
export async function hasQueuedActions(): Promise<boolean> {
  const count = await getQueueLength();
  return count > 0;
}
