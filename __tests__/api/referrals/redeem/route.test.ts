/** @jest-environment node */
jest.mock('@/lib/referralStore', () => ({
  redeemCode: jest.fn(),
}));

import { POST } from '../../../../app/api/referrals/redeem/route';
import { NextRequest } from 'next/server';
import { redeemCode } from '@/lib/referralStore';

const mockRedeemCode = redeemCode as jest.Mock;

const SCOUT_WALLET = 'GSCOUTWALLET00000000000000000000000000000000000000000000';

function makeRequest(options: {
  cookieHeader?: string;
  body?: unknown;
  rawBody?: string;
} = {}): NextRequest {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (options.cookieHeader) headers['cookie'] = options.cookieHeader;

  return new NextRequest('http://localhost:3000/api/referrals/redeem', {
    method: 'POST',
    headers,
    body:
      options.rawBody !== undefined
        ? options.rawBody
        : options.body !== undefined
          ? JSON.stringify(options.body)
          : undefined,
  });
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('POST /api/referrals/redeem — unauthenticated', () => {
  it('returns 401 when there is no session cookie, without touching the store', async () => {
    const res = await POST(makeRequest({ body: { code: 'SCOUT-AB12CD' } }));

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
    expect(mockRedeemCode).not.toHaveBeenCalled();
  });
});

describe('POST /api/referrals/redeem — malformed body', () => {
  it('returns 400 when the body is not valid JSON', async () => {
    const res = await POST(
      makeRequest({
        cookieHeader: `session=${SCOUT_WALLET}`,
        rawBody: '{not valid json',
      }),
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Invalid request body' });
    expect(mockRedeemCode).not.toHaveBeenCalled();
  });

  it('returns 400 when the body has no code field', async () => {
    const res = await POST(
      makeRequest({ cookieHeader: `session=${SCOUT_WALLET}`, body: {} }),
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Missing referral code' });
    expect(mockRedeemCode).not.toHaveBeenCalled();
  });

  it('returns 400 when code is an empty string', async () => {
    const res = await POST(
      makeRequest({ cookieHeader: `session=${SCOUT_WALLET}`, body: { code: '' } }),
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Missing referral code' });
    expect(mockRedeemCode).not.toHaveBeenCalled();
  });

  it('returns 400 when the request has no body at all', async () => {
    const res = await POST(makeRequest({ cookieHeader: `session=${SCOUT_WALLET}` }));

    expect(res.status).toBe(400);
    expect(mockRedeemCode).not.toHaveBeenCalled();
  });
});

describe('POST /api/referrals/redeem — invalid or already-used code', () => {
  it('returns 404 when redeemCode reports the code could not be redeemed', async () => {
    mockRedeemCode.mockReturnValue(false);

    const res = await POST(
      makeRequest({
        cookieHeader: `session=${SCOUT_WALLET}`,
        body: { code: 'SCOUT-BADCOD' },
      }),
    );

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({
      error: 'Invalid or already redeemed code',
    });
    expect(mockRedeemCode).toHaveBeenCalledWith('SCOUT-BADCOD', SCOUT_WALLET);
  });
});

describe('POST /api/referrals/redeem — happy path', () => {
  it('returns 200 and success:true when redeemCode succeeds', async () => {
    mockRedeemCode.mockReturnValue(true);

    const res = await POST(
      makeRequest({
        cookieHeader: `session=${SCOUT_WALLET}`,
        body: { code: 'SCOUT-AB12CD' },
      }),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
    expect(mockRedeemCode).toHaveBeenCalledWith('SCOUT-AB12CD', SCOUT_WALLET);
  });
});
