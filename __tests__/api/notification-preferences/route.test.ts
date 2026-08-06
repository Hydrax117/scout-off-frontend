/** @jest-environment node */
import { GET, PUT } from '@/app/api/notification-preferences/route';
import { NextRequest } from 'next/server';
import { NotificationPreferencesStore } from '@/lib/notificationPreferencesStore';

const SCOUT = 'GSCOUT0000000000000000000000000000000000000000000000000';

function makeRequest(
  url: string,
  init: { method?: string; cookie?: string; body?: unknown } = {},
): NextRequest {
  const headers: Record<string, string> = {};
  if (init.cookie !== undefined) headers['cookie'] = `session=${init.cookie}`;
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
          cookie: `session=${SCOUT}`,
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
});
