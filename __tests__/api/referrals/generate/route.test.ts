/** @jest-environment node */
jest.mock('@/lib/referralStore', () => ({
  generateCode: jest.fn(),
}));

import { POST } from '../../../../app/api/referrals/generate/route';
import { NextRequest } from 'next/server';
import { generateCode } from '@/lib/referralStore';

const mockGenerateCode = generateCode as jest.Mock;

const SCOUT_WALLET = 'GSCOUTWALLET00000000000000000000000000000000000000000000';

function makeRequest(cookieHeader?: string): NextRequest {
  const headers: Record<string, string> = {};
  if (cookieHeader) headers['cookie'] = cookieHeader;
  return new NextRequest('http://localhost:3000/api/referrals/generate', {
    method: 'POST',
    headers,
  });
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('POST /api/referrals/generate', () => {
  it('returns 401 when there is no session cookie', async () => {
    const res = await POST(makeRequest());

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
    expect(mockGenerateCode).not.toHaveBeenCalled();
  });

  it('generates a code for the authenticated scout and returns it', async () => {
    const referral = {
      code: 'SCOUT-AB12CD',
      scoutWallet: SCOUT_WALLET,
      createdAt: 1700000000000,
      usedBy: null,
      usedAt: null,
    };
    mockGenerateCode.mockReturnValue(referral);

    const res = await POST(makeRequest(`session=${SCOUT_WALLET}`));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(referral);
    expect(mockGenerateCode).toHaveBeenCalledWith(SCOUT_WALLET);
  });

  it('passes the exact session cookie value through as the scout wallet', async () => {
    mockGenerateCode.mockReturnValue({
      code: 'SCOUT-ZZ99YY',
      scoutWallet: SCOUT_WALLET,
      createdAt: 1700000000000,
      usedBy: null,
      usedAt: null,
    });

    await POST(makeRequest(`session=${SCOUT_WALLET}`));

    expect(mockGenerateCode).toHaveBeenCalledTimes(1);
    expect(mockGenerateCode).toHaveBeenCalledWith(SCOUT_WALLET);
  });
});
