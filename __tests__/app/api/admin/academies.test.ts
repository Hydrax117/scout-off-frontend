/** @jest-environment node */

// lib/api.ts creates its own axios instance via axios.create() at module
// load time, so the mock's methods must exist before the route modules are
// imported — same pattern as __tests__/api/players/search/route.test.ts.
// The route modules also read process.env.NEXT_PUBLIC_ADMIN_ADDRESS at
// import time, so each describe block sets the env var and re-imports via
// jest.resetModules() rather than a single static top-level import.
let mockGet: jest.Mock;
let mockPost: jest.Mock;
let mockDelete: jest.Mock;

jest.mock('axios', () => {
  const get = jest.fn();
  const post = jest.fn();
  const del = jest.fn();
  const instance = { get, post, delete: del };
  return {
    __esModule: true,
    default: {
      create: jest.fn(() => instance),
      __instance: instance,
    },
  };
});

import { NextRequest } from 'next/server';

function requestWithCookie(
  url: string,
  cookie: string | null,
  init: { method?: string; body?: string } = {},
): NextRequest {
  const headers: Record<string, string> = {};
  if (cookie !== null) headers.cookie = `session=${cookie}`;
  return new NextRequest(url, { ...init, headers });
}

// jest.resetModules() re-runs the axios mock factory too, producing a fresh
// instance each time — so mockGet/mockPost/mockDelete must be re-captured
// from the freshly required axios module on every call, not grabbed once.
async function loadRoute(modulePath: string) {
  process.env.NEXT_PUBLIC_ADMIN_ADDRESS = 'GADMIN';
  jest.resetModules();
  const route = require(modulePath);
  const instance = (require('axios') as any).default.__instance;
  mockGet = instance.get;
  mockPost = instance.post;
  mockDelete = instance.delete;
  return route;
}

describe('GET/POST /api/admin/academies', () => {
  it('rejects GET with no session cookie', async () => {
    const { GET } = await loadRoute('@/app/api/admin/academies/route');
    const res = await GET(
      requestWithCookie('http://localhost/api/admin/academies', null),
    );
    expect(res.status).toBe(401);
  });

  it('rejects GET from a non-admin wallet', async () => {
    const { GET } = await loadRoute('@/app/api/admin/academies/route');
    const res = await GET(
      requestWithCookie('http://localhost/api/admin/academies', 'GNOTADMIN'),
    );
    expect(res.status).toBe(401);
  });

  it('proxies GET to the backend for the admin wallet', async () => {
    const { GET } = await loadRoute('@/app/api/admin/academies/route');
    mockGet.mockResolvedValueOnce({ data: [{ id: 'a1', name: 'FC Sahel' }] });

    const res = await GET(
      requestWithCookie('http://localhost/api/admin/academies', 'GADMIN'),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([{ id: 'a1', name: 'FC Sahel' }]);
    expect(mockGet).toHaveBeenCalledWith('/academies');
  });

  it('rejects POST with no session cookie', async () => {
    const { POST } = await loadRoute('@/app/api/admin/academies/route');
    const res = await POST(
      requestWithCookie('http://localhost/api/admin/academies', null, {
        method: 'POST',
        body: JSON.stringify({ name: 'FC Sahel', ownerWallet: 'GOWNER' }),
      }),
    );
    expect(res.status).toBe(401);
  });

  it('validates required fields on POST', async () => {
    const { POST } = await loadRoute('@/app/api/admin/academies/route');
    const res = await POST(
      requestWithCookie('http://localhost/api/admin/academies', 'GADMIN', {
        method: 'POST',
        body: JSON.stringify({ name: '' }),
      }),
    );
    expect(res.status).toBe(400);
  });

  it('POSTs to the backend with createdBy set to the session wallet', async () => {
    const { POST } = await loadRoute('@/app/api/admin/academies/route');
    mockPost.mockResolvedValueOnce({
      data: { id: 'a1', name: 'FC Sahel', ownerWallet: 'GOWNER', members: [] },
    });

    const res = await POST(
      requestWithCookie('http://localhost/api/admin/academies', 'GADMIN', {
        method: 'POST',
        body: JSON.stringify({ name: 'FC Sahel', ownerWallet: 'GOWNER' }),
      }),
    );

    expect(res.status).toBe(201);
    expect(mockPost).toHaveBeenCalledWith('/academies', {
      name: 'FC Sahel',
      ownerWallet: 'GOWNER',
      createdBy: 'GADMIN',
    });
  });

  it('forwards the backend error status and message on POST failure', async () => {
    const { POST } = await loadRoute('@/app/api/admin/academies/route');
    mockPost.mockRejectedValueOnce({
      response: { status: 409, data: { error: 'Wallet already assigned' } },
    });

    const res = await POST(
      requestWithCookie('http://localhost/api/admin/academies', 'GADMIN', {
        method: 'POST',
        body: JSON.stringify({ name: 'FC Sahel', ownerWallet: 'GOWNER' }),
      }),
    );

    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('Wallet already assigned');
  });
});

describe('POST /api/admin/academies/[id]/members', () => {
  it('rejects when not the admin wallet', async () => {
    const { POST } = await loadRoute(
      '@/app/api/admin/academies/[id]/members/route',
    );
    const res = await POST(
      requestWithCookie(
        'http://localhost/api/admin/academies/a1/members',
        'GNOTADMIN',
        { method: 'POST', body: JSON.stringify({ wallet: 'GCOACH' }) },
      ),
      { params: { id: 'a1' } },
    );
    expect(res.status).toBe(401);
  });

  it('adds addedBy from the session wallet and proxies to the backend', async () => {
    const { POST } = await loadRoute(
      '@/app/api/admin/academies/[id]/members/route',
    );
    mockPost.mockResolvedValueOnce({
      data: { id: 'a1', name: 'FC Sahel', members: [{ wallet: 'GCOACH' }] },
    });

    const res = await POST(
      requestWithCookie(
        'http://localhost/api/admin/academies/a1/members',
        'GADMIN',
        { method: 'POST', body: JSON.stringify({ wallet: 'GCOACH' }) },
      ),
      { params: { id: 'a1' } },
    );

    expect(res.status).toBe(201);
    expect(mockPost).toHaveBeenCalledWith('/academies/a1/members', {
      wallet: 'GCOACH',
      addedBy: 'GADMIN',
    });
  });
});

describe('DELETE /api/admin/academies/[id]/members/[wallet]', () => {
  it('rejects when not the admin wallet', async () => {
    const { DELETE } = await loadRoute(
      '@/app/api/admin/academies/[id]/members/[wallet]/route',
    );
    const res = await DELETE(
      requestWithCookie(
        'http://localhost/api/admin/academies/a1/members/GCOACH',
        'GNOTADMIN',
        { method: 'DELETE' },
      ),
      { params: { id: 'a1', wallet: 'GCOACH' } },
    );
    expect(res.status).toBe(401);
  });

  it('proxies the delete to the backend for the admin wallet', async () => {
    const { DELETE } = await loadRoute(
      '@/app/api/admin/academies/[id]/members/[wallet]/route',
    );
    mockDelete.mockResolvedValueOnce({ data: { success: true } });

    const res = await DELETE(
      requestWithCookie(
        'http://localhost/api/admin/academies/a1/members/GCOACH',
        'GADMIN',
        { method: 'DELETE' },
      ),
      { params: { id: 'a1', wallet: 'GCOACH' } },
    );

    expect(res.status).toBe(200);
    expect(mockDelete).toHaveBeenCalledWith('/academies/a1/members/GCOACH');
  });
});
