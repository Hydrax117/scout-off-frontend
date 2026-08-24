import {
  fetchAllReferralCodes,
  fetchActivityEvents,
  type ActivityEvent,
} from '@/lib/api';
import {
  analyzeReferralAbuse,
  analyzePayToContactAbuse,
} from '@/lib/fraudDetection';
import type { FraudFlag } from '@/types';

/**
 * Bounds how much of the activity feed a single evaluation will pull before
 * running pay-to-contact heuristics over it. Shared by both the on-demand
 * (admin panel load) and scheduled (cron) evaluation paths — see
 * docs/fraud-detection.md.
 */
const ACTIVITY_PAGE_SIZE = 200;
const MAX_ACTIVITY_PAGES = 25; // up to 5,000 events

async function fetchAllActivityEvents(): Promise<{
  events: ActivityEvent[];
  truncated: boolean;
}> {
  const events: ActivityEvent[] = [];
  let page = 1;
  let total = Infinity;

  while (events.length < total && page <= MAX_ACTIVITY_PAGES) {
    const res = await fetchActivityEvents(page, ACTIVITY_PAGE_SIZE);
    events.push(...res.events);
    total = res.total;
    if (res.events.length === 0) break;
    page++;
  }

  return { events, truncated: events.length < total };
}

export interface FraudFlagEvaluationResult {
  flags: FraudFlag[];
  warnings: string[];
}

/**
 * Gathers cross-wallet referral/activity data and runs the pure heuristics
 * in lib/fraudDetection.ts over it. Extracted out of
 * app/api/admin/fraud-flags/route.ts so the exact same evaluation can be
 * driven either by an admin's on-demand page load or by the scheduled cron
 * trigger (app/api/cron/fraud-flags/route.ts) without duplicating the
 * gathering/error-handling logic.
 */
export async function runFraudFlagEvaluation(): Promise<FraudFlagEvaluationResult> {
  let referralFlags: FraudFlag[] = [];
  const warnings: string[] = [];
  try {
    referralFlags = analyzeReferralAbuse(await fetchAllReferralCodes());
  } catch {
    warnings.push(
      'Referral backend is unavailable — referral heuristics were skipped. Pay-to-contact heuristics below are unaffected.',
    );
  }

  let payToContactFlags: FraudFlag[] = [];
  try {
    const { events, truncated } = await fetchAllActivityEvents();
    payToContactFlags = analyzePayToContactAbuse(events);
    if (truncated) {
      warnings.push(
        `Activity feed has more than ${MAX_ACTIVITY_PAGES * ACTIVITY_PAGE_SIZE} events; pay-to-contact analysis only covers the most recent ones.`,
      );
    }
  } catch {
    warnings.push(
      'Activity feed backend is unavailable — pay-to-contact heuristics were skipped. Referral heuristics below are unaffected.',
    );
  }

  const flags = [...referralFlags, ...payToContactFlags].sort((a, b) => {
    const severityRank = { high: 0, medium: 1, low: 2 } as const;
    return severityRank[a.severity] - severityRank[b.severity];
  });

  return { flags, warnings };
}
