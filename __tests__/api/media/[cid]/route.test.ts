/** @jest-environment node */
jest.mock('@/lib/mediaUrlSigning', () => ({
  verifyMediaUrlSignature: jest.fn(),
}));

import { GET } from '../../../../app/api/media/[cid]/route';
import { NextRequest } from 'next/server';
import { verifyMediaUrlSignature } from '@/lib/mediaUrlSigning';

const mockVerify = verifyMediaUrlSignature as jest.Mock;

function makeRequest(
  url: string,
  headers: Record<string, string> = {},
): NextRequest {
  return new NextRequest(url, { headers });
}

function mockFetchOnce(response: Partial<Response> & { ok: boolean }) {
  (global.fetch as jest.Mock).mockResolvedValueOnce(response as Response);
}

beforeEach(() => {
  jest.clearAllMocks();
  global.fetch = jest.fn();
  process.env.NEXT_PUBLIC_APP_URL = 'https://scoutoff.app';
  delete process.env.MEDIA_URL_SIGNING_SECRET;
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('GET /api/media/[cid] — happy path', () => {
  it('streams the upstream body and sets long-lived immutable cache headers', async () => {
    mockFetchOnce({
      ok: true,
      status: 200,
      body: new ReadableStream(),
      headers: new Headers({ 'content-type': 'image/webp' }),
    } as unknown as Response);

    const req = makeRequest('http://localhost:3000/api/media/QmAbc123');
    const res = await GET(req, { params: { cid: 'QmAbc123' } });

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/webp');
    expect(res.headers.get('cache-control')).toBe(
      'public, max-age=31536000, immutable',
    );
    expect(res.headers.get('cdn-cache-control')).toBe(
      'public, max-age=31536000, immutable',
    );
  });

  it('falls back to the next gateway when the primary fails', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({ ok: false, status: 502 } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        body: new ReadableStream(),
        headers: new Headers({ 'content-type': 'image/png' }),
      } as unknown as Response);

    const req = makeRequest('http://localhost:3000/api/media/QmAbc123');
    const res = await GET(req, { params: { cid: 'QmAbc123' } });

    expect(res.status).toBe(200);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('returns 502 when every gateway fails', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 502,
    } as Response);

    const req = makeRequest('http://localhost:3000/api/media/QmAbc123');
    const res = await GET(req, { params: { cid: 'QmAbc123' } });

    expect(res.status).toBe(502);
  });
});

describe('GET /api/media/[cid] — input validation', () => {
  it('returns 400 when cid is empty', async () => {
    const req = makeRequest('http://localhost:3000/api/media/');
    const res = await GET(req, { params: { cid: '' } });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/media/[cid] — referrer gating (no signature)', () => {
  it('allows a request with no Referer header', async () => {
    mockFetchOnce({
      ok: true,
      status: 200,
      body: new ReadableStream(),
      headers: new Headers({ 'content-type': 'image/png' }),
    } as unknown as Response);

    const req = makeRequest('http://localhost:3000/api/media/QmAbc123');
    const res = await GET(req, { params: { cid: 'QmAbc123' } });
    expect(res.status).toBe(200);
  });

  it('allows a same-origin Referer', async () => {
    mockFetchOnce({
      ok: true,
      status: 200,
      body: new ReadableStream(),
      headers: new Headers({ 'content-type': 'image/png' }),
    } as unknown as Response);

    const req = makeRequest('http://localhost:3000/api/media/QmAbc123', {
      referer: 'https://scoutoff.app/player/abc',
    });
    const res = await GET(req, { params: { cid: 'QmAbc123' } });
    expect(res.status).toBe(200);
  });

  it('rejects a cross-site Referer', async () => {
    const req = makeRequest('http://localhost:3000/api/media/QmAbc123', {
      referer: 'https://evil-hotlinker.example/steal',
    });
    const res = await GET(req, { params: { cid: 'QmAbc123' } });
    expect(res.status).toBe(403);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

describe('GET /api/media/[cid] — signed URL handling', () => {
  it('accepts a request with a valid signature even from a cross-site Referer', async () => {
    mockVerify.mockReturnValue(true);
    mockFetchOnce({
      ok: true,
      status: 200,
      body: new ReadableStream(),
      headers: new Headers({ 'content-type': 'image/png' }),
    } as unknown as Response);

    const req = makeRequest(
      'http://localhost:3000/api/media/QmAbc123?exp=9999999999&sig=deadbeef',
      { referer: 'https://evil-hotlinker.example/steal' },
    );
    const res = await GET(req, { params: { cid: 'QmAbc123' } });
    expect(res.status).toBe(200);
  });

  it('rejects a request with an invalid signature', async () => {
    mockVerify.mockReturnValue(false);

    const req = makeRequest(
      'http://localhost:3000/api/media/QmAbc123?exp=9999999999&sig=bad',
    );
    const res = await GET(req, { params: { cid: 'QmAbc123' } });
    expect(res.status).toBe(403);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

describe('GET /api/media/[cid] — rate limiting', () => {
  it('returns 429 with Retry-After once a single IP exceeds the window limit', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      body: new ReadableStream(),
      headers: new Headers({ 'content-type': 'image/png' }),
    } as unknown as Response);

    const ip = `rate-limit-test-ip-${Math.random()}`;
    let lastRes;
    for (let i = 0; i < 121; i++) {
      const req = makeRequest('http://localhost:3000/api/media/QmAbc123', {
        'x-forwarded-for': ip,
      });
      lastRes = await GET(req, { params: { cid: 'QmAbc123' } });
    }

    expect(lastRes!.status).toBe(429);
    expect(lastRes!.headers.get('retry-after')).toBe('60');
  });
});
