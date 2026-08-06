/** @jest-environment node */
import { GET, POST } from '@/app/api/disputes/route';
import { NextRequest } from 'next/server';
import { MilestoneDisputeStore } from '@/lib/milestoneDisputeStore';

const ADMIN = 'GADMIN0000000000000000000000000000000000000000000000000';
const SCOUT = 'GSCOUT0000000000000000000000000000000000000000000000000';
const OTHER = 'GOTHER0000000000000000000000000000000000000000000000000';

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
  process.env.NEXT_PUBLIC_ADMIN_ADDRESS = ADMIN;
  MilestoneDisputeStore.resetInstance();
});

afterEach(() => {
  MilestoneDisputeStore.resetInstance();
  delete process.env.NEXT_PUBLIC_ADMIN_ADDRESS;
});

describe('GET /api/disputes', () => {
  it('returns 401 without a session cookie', async () => {
    const res = await GET(makeRequest('http://localhost/api/disputes'));
    expect(res.status).toBe(401);
  });

  it('returns 400 for an invalid status filter', async () => {
    const res = await GET(
      makeRequest('http://localhost/api/disputes?status=bogus', {
        cookie: SCOUT,
      }),
    );
    expect(res.status).toBe(400);
  });

  it('scopes results to the requesting wallet for non-admins', async () => {
    MilestoneDisputeStore.getInstance().create({
      playerId: 'p1',
      playerWallet: SCOUT,
      milestoneId: 'm1',
      milestoneDescription: 'desc',
      reason: 'this is a valid reason',
    });
    MilestoneDisputeStore.getInstance().create({
      playerId: 'p2',
      playerWallet: OTHER,
      milestoneId: 'm2',
      milestoneDescription: 'desc',
      reason: 'this is a valid reason',
    });

    const res = await GET(
      makeRequest('http://localhost/api/disputes', { cookie: SCOUT }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].playerWallet).toBe(SCOUT);
  });

  it('returns the full queue for admins, optionally filtered by status', async () => {
    MilestoneDisputeStore.getInstance().create({
      playerId: 'p1',
      playerWallet: SCOUT,
      milestoneId: 'm1',
      milestoneDescription: 'desc',
      reason: 'this is a valid reason',
    });
    MilestoneDisputeStore.getInstance().create({
      playerId: 'p2',
      playerWallet: OTHER,
      milestoneId: 'm2',
      milestoneDescription: 'desc',
      reason: 'this is a valid reason',
    });

    const res = await GET(
      makeRequest('http://localhost/api/disputes', { cookie: ADMIN }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(2);
  });

  it('filters the admin queue by status', async () => {
    const store = MilestoneDisputeStore.getInstance();
    const d = store.create({
      playerId: 'p1',
      playerWallet: SCOUT,
      milestoneId: 'm1',
      milestoneDescription: 'desc',
      reason: 'this is a valid reason',
    });
    store.decide(d.id, {
      status: 'upheld',
      decidedBy: ADMIN,
      resolutionNote: null,
      revokeTxHash: null,
    });
    store.create({
      playerId: 'p2',
      playerWallet: OTHER,
      milestoneId: 'm2',
      milestoneDescription: 'desc',
      reason: 'this is a valid reason',
    });

    const res = await GET(
      makeRequest('http://localhost/api/disputes?status=pending', {
        cookie: ADMIN,
      }),
    );
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].status).toBe('pending');
  });

  it('returns 500 when the store throws', async () => {
    jest.spyOn(MilestoneDisputeStore, 'getInstance').mockImplementation(() => {
      throw new Error('db down');
    });

    const res = await GET(
      makeRequest('http://localhost/api/disputes', { cookie: SCOUT }),
    );
    expect(res.status).toBe(500);

    jest.restoreAllMocks();
  });
});

describe('POST /api/disputes', () => {
  it('returns 401 without a session cookie', async () => {
    const res = await POST(
      makeRequest('http://localhost/api/disputes', {
        method: 'POST',
        body: {
          playerId: 'p1',
          milestoneId: 'm1',
          milestoneDescription: 'desc',
          reason: 'this is a valid reason',
        },
      }),
    );
    expect(res.status).toBe(401);
  });

  it('returns 400 for an invalid JSON body', async () => {
    const req = new NextRequest('http://localhost/api/disputes', {
      method: 'POST',
      headers: {
        cookie: `session=${SCOUT}`,
        'content-type': 'application/json',
      },
      body: 'not json',
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('returns 400 for a missing playerId', async () => {
    const res = await POST(
      makeRequest('http://localhost/api/disputes', {
        method: 'POST',
        cookie: SCOUT,
        body: {
          milestoneId: 'm1',
          milestoneDescription: 'desc',
          reason: 'this is a valid reason',
        },
      }),
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 when reason is shorter than 10 characters', async () => {
    const res = await POST(
      makeRequest('http://localhost/api/disputes', {
        method: 'POST',
        cookie: SCOUT,
        body: {
          playerId: 'p1',
          milestoneId: 'm1',
          milestoneDescription: 'desc',
          reason: 'too short',
        },
      }),
    );
    expect(res.status).toBe(400);
  });

  it('creates a dispute and returns it with 201', async () => {
    const res = await POST(
      makeRequest('http://localhost/api/disputes', {
        method: 'POST',
        cookie: SCOUT,
        body: {
          playerId: 'p1',
          milestoneId: 'm1',
          milestoneDescription: 'desc',
          reason: 'this is a valid reason',
        },
      }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toMatchObject({
      playerId: 'p1',
      playerWallet: SCOUT,
      milestoneId: 'm1',
      status: 'pending',
    });
  });

  it('returns 409 for a duplicate open dispute on the same milestone', async () => {
    MilestoneDisputeStore.getInstance().create({
      playerId: 'p1',
      playerWallet: SCOUT,
      milestoneId: 'm1',
      milestoneDescription: 'desc',
      reason: 'this is a valid reason',
    });

    const res = await POST(
      makeRequest('http://localhost/api/disputes', {
        method: 'POST',
        cookie: SCOUT,
        body: {
          playerId: 'p1',
          milestoneId: 'm1',
          milestoneDescription: 'desc',
          reason: 'another valid reason here',
        },
      }),
    );
    expect(res.status).toBe(409);
  });

  it('returns 500 when the store throws unexpectedly', async () => {
    jest.spyOn(MilestoneDisputeStore, 'getInstance').mockImplementation(() => {
      throw new Error('db down');
    });

    const res = await POST(
      makeRequest('http://localhost/api/disputes', {
        method: 'POST',
        cookie: SCOUT,
        body: {
          playerId: 'p1',
          milestoneId: 'm1',
          milestoneDescription: 'desc',
          reason: 'this is a valid reason',
        },
      }),
    );
    expect(res.status).toBe(500);

    jest.restoreAllMocks();
  });
});
