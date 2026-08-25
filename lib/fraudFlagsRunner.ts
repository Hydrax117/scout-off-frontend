import {
  fetchAllReferralCodes,
  fetchActivityEvents,
  type ActivityEvent,
} from '@/lib/api';
import {
  analyzeReferralAbuse,
  analyzePayToContactAbuse,
} from '@/lib/fraudDetection';
import { isFeatureEnabled } from '@/lib/featureFlags';
import { FraudThrottleStore } from '@/lib/fraudThrottleStore';
import type { FraudFlag } from '@/types';

/**
 * Heuristics the doc explicitly names as safe auto-throttle candidates —
 * see docs/fraud-detection.md's "What would change this" section.
 * subscription_cycling is explicitly excluded: it has "the highest genuine
 * false-positive rate" of any heuristic here and must stay alert-only.
 */
const AUTO_THROTTLE_HEURISTICS = new Set([
  'cross_scout_redeemer_ring',
  'self_redemption',
]);

/**
 * Places a wallet in a throttled state for any flag matching one of the two
 * named heuristics at 'high' severity (the documented confidence bar —
 * self_redemption is always 'high' since it has no false-positive risk;
 * cross_scout_redeemer_ring only reaches 'high' at double its base distinct-
 * scout threshold). Behind NEXT_PUBLIC_FEATURE_FRAUD_AUTO_THROTTLE so this
 * can be enabled only once thresholds have actually been validated against
 * real traffic, per the doc's own caution against auto-enforcement on
 * untuned thresholds. A throttle never auto-expires — only an explicit
 * admin action (FraudFlagsPanel.tsx) lifts it; see lib/fraudThrottleStore.ts.
 */
function applyAutoThrottles(flags: FraudFlag[]): void {
  if (!isFeatureEnabled('FRAUD_AUTO_THROTTLE')) return;

  const store = FraudThrottleStore.getInstance();
  for (const flag of flags) {
    if (!AUTO_THROTTLE_HEURISTICS.has(flag.heuristic)) continue;
    if (flag.severity !== 'high') continue;

    const wallet = flag.wallets[0];
    if (!wallet) continue;

    store.placeThrottle({
      wallet,
      heuristic: flag.heuristic,
      category: flag.category,
      flagId: flag.id,
      reason: flag.reason,
      evidence: flag.evidence,
    });
  }
}

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

  applyAutoThrottles(flags);

  return { flags, warnings };
}
