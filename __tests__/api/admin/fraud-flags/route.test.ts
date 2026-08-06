/** @jest-environment node */
jest.mock('@/lib/api', () => ({
  fetchAllReferralCodes: jest.fn(),
  fetchActivityEvents: jest.fn(),
}));
jest.mock('@/lib/fraudDetection', () => ({
  analyzeReferralAbuse: jest.fn(),
  analyzePayToContactAbuse: jest.fn(),
}));

import { GET } from '@/app/api/admin/fraud-flags/route';
import { NextRequest } from 'next/server';
import { fetchAllReferralCodes, fetchActivityEvents } from '@/lib/api';
import {
  analyzeReferralAbuse,
  analyzePayToContactAbuse,
} from '@/lib/fraudDetection';
import type { FraudFlag } from '@/types';

const ADMIN = 'GADMIN0000000000000000000000000000000000000000000000000';

const mockFetchAllReferralCodes = fetchAllReferralCodes as jest.Mock;
const mockFetchActivityEvents = fetchActivityEvents as jest.Mock;
const mockAnalyzeReferralAbuse = analyzeReferralAbuse as jest.Mock;
const mockAnalyzePayToContactAbuse = analyzePayToContactAbuse as jest.Mock;

function makeRequest(cookie?: string): NextRequest {
  const headers: Record<string, string> = {};
  if (cookie !== undefined) headers['cookie'] = `session=${cookie}`;
  return new NextRequest('http://localhost/api/admin/fraud-flags', {
    headers,
  });
}

function flag(
  category: FraudFlag['category'],
  severity: FraudFlag['severity'],
  id: string,
): FraudFlag {
  return {
    id,
    category,
    heuristic: 'test',
    severity,
    wallets: ['GSOMEONE'],
    reason: 'test reason',
    evidence: {},
  };
}

beforeEach(() => {
  process.env.NEXT_PUBLIC_ADMIN_ADDRESS = ADMIN;
  jest.clearAllMocks();
  mockFetchAllReferralCodes.mockResolvedValue([]);
  mockFetchActivityEvents.mockResolvedValue({ events: [], total: 0 });
  mockAnalyzeReferralAbuse.mockReturnValue([]);
  mockAnalyzePayToContactAbuse.mockReturnValue([]);
});

afterEach(() => {
  delete process.env.NEXT_PUBLIC_ADMIN_ADDRESS;
});

describe('GET /api/admin/fraud-flags', () => {
  it('returns 403 without a session cookie', async () => {
    const res = await GET(makeRequest());
    expect(res.status).toBe(403);
  });

  it('returns 403 for a non-admin session cookie', async () => {
    const res = await GET(makeRequest('GSOMEONEELSE'));
    expect(res.status).toBe(403);
  });

  it('returns 403 when NEXT_PUBLIC_ADMIN_ADDRESS is not configured', async () => {
    delete process.env.NEXT_PUBLIC_ADMIN_ADDRESS;
    const res = await GET(makeRequest(ADMIN));
    expect(res.status).toBe(403);
  });

  it('returns an empty flags/warnings response when nothing is flagged', async () => {
    const res = await GET(makeRequest(ADMIN));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ flags: [], warnings: [] });
  });

  it('merges and sorts referral and pay-to-contact flags by severity', async () => {
    mockAnalyzeReferralAbuse.mockReturnValue([flag('referral', 'low', 'r1')]);
    mockAnalyzePayToContactAbuse.mockReturnValue([
      flag('pay_to_contact', 'high', 'p1'),
    ]);

    const res = await GET(makeRequest(ADMIN));
    const body = await res.json();
    expect(body.flags).toHaveLength(2);
    expect(body.flags[0].id).toBe('p1');
    expect(body.flags[1].id).toBe('r1');
  });

  it('paginates through activity events across multiple pages', async () => {
    mockFetchActivityEvents
      .mockResolvedValueOnce({
        events: [
          { id: '1', type: 'player_contacted', timestamp: 1, actor: 'a' },
        ],
        total: 2,
      })
      .mockResolvedValueOnce({
        events: [
          { id: '2', type: 'player_contacted', timestamp: 2, actor: 'b' },
        ],
        total: 2,
      });

    const res = await GET(makeRequest(ADMIN));
    expect(res.status).toBe(200);
    expect(mockFetchActivityEvents).toHaveBeenCalledTimes(2);
    expect(mockAnalyzePayToContactAbuse).toHaveBeenCalledWith([
      { id: '1', type: 'player_contacted', timestamp: 1, actor: 'a' },
      { id: '2', type: 'player_contacted', timestamp: 2, actor: 'b' },
    ]);
  });

  it('stops paginating and warns when the activity feed is truncated', async () => {
    mockFetchActivityEvents.mockResolvedValue({
      events: [{ id: '1', type: 'player_contacted', timestamp: 1, actor: 'a' }],
      total: 100000,
    });

    const res = await GET(makeRequest(ADMIN));
    const body = await res.json();
    // MAX_ACTIVITY_PAGES caps the loop at 25 pages regardless of `total`.
    expect(mockFetchActivityEvents).toHaveBeenCalledTimes(25);
    expect(body.warnings.some((w: string) => w.includes('more than'))).toBe(
      true,
    );
  });

  it('warns and continues when the referral backend is unavailable', async () => {
    mockFetchAllReferralCodes.mockRejectedValue(new Error('ECONNREFUSED'));

    const res = await GET(makeRequest(ADMIN));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(
      body.warnings.some((w: string) => w.includes('Referral backend')),
    ).toBe(true);
    expect(mockAnalyzePayToContactAbuse).toHaveBeenCalled();
  });

  it('warns and continues when the activity feed backend is unavailable', async () => {
    mockFetchActivityEvents.mockRejectedValue(new Error('ECONNREFUSED'));

    const res = await GET(makeRequest(ADMIN));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(
      body.warnings.some((w: string) => w.includes('Activity feed backend')),
    ).toBe(true);
  });
});
