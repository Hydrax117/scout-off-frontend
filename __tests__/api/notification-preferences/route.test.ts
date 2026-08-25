/** @jest-environment node */
import { GET, PUT } from '@/app/api/notification-preferences/route';
import { NextRequest } from 'next/server';
import { NotificationPreferencesStore } from '@/lib/notificationPreferencesStore';
import { createSessionToken } from '@/lib/session';

const SCOUT = 'GSCOUT0000000000000000000000000000000000000000000000000';

function makeRequest(
  url: string,
  init: { method?: string; cookie?: string; body?: unknown } = {},
): NextRequest {
  const headers: Record<string, string> = {};
  if (init.cookie !== undefined)
    headers['cookie'] =
      `session=${createSessionToken(init.cookie, 'access', 20 * 60)}`;
  if (init.body !== undefined) headers['content-type'] = 'application/json';
  return new NextRequest(url, {
    method: init.method ?? 'GET',
    headers,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
}

beforeEach(() => {
  NotificationPreferencesStore.resetInstance();
});

afterEach(() => {
  NotificationPreferencesStore.resetInstance();
});

describe('GET /api/notification-preferences', () => {
  it('returns 401 without a session cookie', async () => {
    const res = await GET(
      makeRequest('http://localhost/api/notification-preferences'),
    );
    expect(res.status).toBe(401);
  });

  it('defaults to all-enabled when no preferences have been saved', async () => {
    const res = await GET(
      makeRequest('http://localhost/api/notification-preferences', {
        cookie: SCOUT,
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      milestoneApprovals: true,
      contactUnlocks: true,
    });
  });

  it('returns the saved preferences for the requesting wallet', async () => {
    NotificationPreferencesStore.getInstance().set(SCOUT, {
      milestoneApprovals: false,
      contactUnlocks: true,
    });

    const res = await GET(
      makeRequest('http://localhost/api/notification-preferences', {
        cookie: SCOUT,
      }),
    );
    const body = await res.json();
    expect(body).toEqual({
      milestoneApprovals: false,
      contactUnlocks: true,
    });
  });

  it('returns 500 when the store throws', async () => {
    jest
      .spyOn(NotificationPreferencesStore, 'getInstance')
      .mockImplementation(() => {
        throw new Error('db down');
      });

    const res = await GET(
      makeRequest('http://localhost/api/notification-preferences', {
        cookie: SCOUT,
      }),
    );
    expect(res.status).toBe(500);

    jest.restoreAllMocks();
  });
});

describe('PUT /api/notification-preferences', () => {
  it('returns 401 without a session cookie', async () => {
    const res = await PUT(
      makeRequest('http://localhost/api/notification-preferences', {
        method: 'PUT',
        body: { milestoneApprovals: true, contactUnlocks: true },
      }),
    );
    expect(res.status).toBe(401);
  });

  it('returns 400 for an invalid JSON body', async () => {
    const req = new NextRequest(
      'http://localhost/api/notification-preferences',
      {
        method: 'PUT',
        headers: {
          cookie: `session=${createSessionToken(SCOUT, 'access', 20 * 60)}`,
          'content-type': 'application/json',
        },
        body: 'not json',
      },
    );
    const res = await PUT(req);
    expect(res.status).toBe(400);
  });

  it('returns 400 when milestoneApprovals is not a boolean', async () => {
    const res = await PUT(
      makeRequest('http://localhost/api/notification-preferences', {
        method: 'PUT',
        cookie: SCOUT,
        body: { milestoneApprovals: 'yes', contactUnlocks: true },
      }),
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 when contactUnlocks is missing', async () => {
    const res = await PUT(
      makeRequest('http://localhost/api/notification-preferences', {
        method: 'PUT',
        cookie: SCOUT,
        body: { milestoneApprovals: true },
      }),
    );
    expect(res.status).toBe(400);
  });

  it('updates and returns the new preferences', async () => {
    const res = await PUT(
      makeRequest('http://localhost/api/notification-preferences', {
        method: 'PUT',
        cookie: SCOUT,
        body: { milestoneApprovals: false, contactUnlocks: false },
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      milestoneApprovals: false,
      contactUnlocks: false,
    });
    expect(NotificationPreferencesStore.getInstance().get(SCOUT)).toEqual({
      milestoneApprovals: false,
      contactUnlocks: false,
    });
  });

  it('returns 500 when the store throws unexpectedly', async () => {
    jest
      .spyOn(NotificationPreferencesStore, 'getInstance')
      .mockImplementation(() => {
        throw new Error('db down');
      });

    const res = await PUT(
      makeRequest('http://localhost/api/notification-preferences', {
        method: 'PUT',
        cookie: SCOUT,
        body: { milestoneApprovals: true, contactUnlocks: true },
      }),
    );
    expect(res.status).toBe(500);

    jest.restoreAllMocks();
  });

  it('returns 400 when baseVersion is provided but not a number', async () => {
    const res = await PUT(
      makeRequest('http://localhost/api/notification-preferences', {
        method: 'PUT',
        cookie: SCOUT,
        body: {
          milestoneApprovals: true,
          contactUnlocks: true,
          baseVersion: 'not-a-number',
        },
      }),
    );
    expect(res.status).toBe(400);
  });
});

// ── Optimistic concurrency / conflict detection (issue #1178) ────────────────

describe('PUT /api/notification-preferences — conflict detection', () => {
  it('applies the write and sets an ETag when baseVersion matches the current (no-row) version', async () => {
    const res = await PUT(
      makeRequest('http://localhost/api/notification-preferences', {
        method: 'PUT',
        cookie: SCOUT,
        body: {
          milestoneApprovals: false,
          contactUnlocks: true,
          baseVersion: 0, // no row exists yet -> current version is 0
        },
      }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('ETag')).toBeTruthy();
    const body = await res.json();
    expect(body).toEqual({ milestoneApprovals: false, contactUnlocks: true });
  });

  it('omitting baseVersion always applies the write, unaffected by any prior write (back-compat single-tab path)', async () => {
    NotificationPreferencesStore.getInstance().set(SCOUT, {
      milestoneApprovals: false,
      contactUnlocks: false,
    });

    const res = await PUT(
      makeRequest('http://localhost/api/notification-preferences', {
        method: 'PUT',
        cookie: SCOUT,
        body: { milestoneApprovals: true, contactUnlocks: true },
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ milestoneApprovals: true, contactUnlocks: true });
  });

  /**
   * The concrete, server-side half of the two-tabs scenario: tab A reads
   * the record, then flushes an update based on that version — this
   * succeeds and advances the version. Tab B had read the *same* original
   * version before going offline; when its own queued flush reaches the
   * server afterwards, its baseVersion is now stale. The server must
   * reject it with 409 rather than silently overwriting tab A's write.
   */
  it('rejects a stale-baseVersion PUT with 409 once another write has advanced the version', async () => {
    // Tab A and Tab B both "load" the settings page while the row doesn't
    // exist yet -> both see version 0.
    const baseVersionSeenByBothTabs = 0;

    // Tab A flushes first (e.g. it reconnected slightly sooner).
    const tabARes = await PUT(
      makeRequest('http://localhost/api/notification-preferences', {
        method: 'PUT',
        cookie: SCOUT,
        body: {
          milestoneApprovals: false,
          contactUnlocks: true,
          baseVersion: baseVersionSeenByBothTabs,
        },
      }),
    );
    expect(tabARes.status).toBe(200);

    // Tab B flushes afterwards, still carrying the stale version it
    // originally read.
    const tabBRes = await PUT(
      makeRequest('http://localhost/api/notification-preferences', {
        method: 'PUT',
        cookie: SCOUT,
        body: {
          milestoneApprovals: true,
          contactUnlocks: false,
          baseVersion: baseVersionSeenByBothTabs,
        },
      }),
    );

    expect(tabBRes.status).toBe(409);
    const tabBBody = await tabBRes.json();
    expect(tabBBody.error).toBe('conflict');
    expect(tabBBody.current).toEqual({
      milestoneApprovals: false,
      contactUnlocks: true,
    });
    expect(typeof tabBBody.currentVersion).toBe('number');
    expect(tabBBody.currentVersion).toBeGreaterThan(baseVersionSeenByBothTabs);

    // Tab A's write was NOT overwritten by tab B's rejected request.
    expect(NotificationPreferencesStore.getInstance().get(SCOUT)).toEqual({
      milestoneApprovals: false,
      contactUnlocks: true,
    });
  });
});
