'use client';

import { useCallback } from 'react';
import { mutate } from 'swr';
import { useIndexerEventCache, INDEXER_CACHE_KEY } from './useIndexerEventCache';

/**
 * Approximate XLM fees by subscription tier — indexed events record the tier,
 * not the amount paid, since the contract enforces amounts at submit time.
 * Mirrors hooks/useSpendingSummary.ts's TIER_FEES_XLM.
 */
const TIER_FEES_XLM: Record<string, number> = {
  basic: 5,
  pro: 12,
  elite: 20,
};

/** Fixed pay-to-contact fee, per hooks/useSpendingSummary.ts. */
const CONTACT_FEE_XLM = 1;

export interface DailyRevenuePoint {
  /** 'YYYY-MM-DD', UTC day boundaries. */
  date: string;
  contactFeeXlm: number;
  subscriptionXlm: number;
  totalXlm: number;
}

export interface FeeRevenueData {
  /** Newest-day-last, so it renders left-to-right chronologically. */
  daily: DailyRevenuePoint[];
}

function dayKey(timestampSeconds: number): string {
  return new Date(timestampSeconds * 1000).toISOString().slice(0, 10);
}

/**
 * Fetches all pay-to-contact and subscription fee-payment events from the
 * shared indexer event cache and aggregates them into a daily revenue series,
 * split by fee type. Period filtering (7/30/90/all-time) is applied by the
 * consuming component over this full series.
 *
 * Uses useIndexerEventCache internally so that concurrent consumers on the
 * same page (e.g. FeeRevenueChart + notifications panel) share a single
 * indexer fetch rather than firing independent full scans.
 */
export function useFeeRevenue() {
  const cache = useIndexerEventCache();

  const refetch = useCallback(() => {
    mutate(INDEXER_CACHE_KEY, undefined, { revalidate: true });
  }, []);

  if (cache.loading) {
    return { data: null, loading: true, error: null, refetch };
  }

  if (cache.error) {
    return { data: null, loading: false, error: cache.error, refetch };
  }

  const byDay = new Map<
    string,
    { contactFeeXlm: number; subscriptionXlm: number }
  >();

  for (const event of cache.events) {
    if (event.type === 'player_contacted') {
      const day = dayKey(event.timestamp);
      const entry = byDay.get(day) ?? { contactFeeXlm: 0, subscriptionXlm: 0 };
      entry.contactFeeXlm += CONTACT_FEE_XLM;
      byDay.set(day, entry);
    } else if (event.type === 'scout_subscribed') {
      const day = dayKey(event.timestamp);
      const tier = String(event.data?.tier ?? 'basic');
      const fee = TIER_FEES_XLM[tier] ?? 5;
      const entry = byDay.get(day) ?? { contactFeeXlm: 0, subscriptionXlm: 0 };
      entry.subscriptionXlm += fee;
      byDay.set(day, entry);
    }
  }

  const daily: DailyRevenuePoint[] = [...byDay.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([date, { contactFeeXlm, subscriptionXlm }]) => ({
      date,
      contactFeeXlm,
      subscriptionXlm,
      totalXlm: contactFeeXlm + subscriptionXlm,
    }));

  return {
    data: { daily } satisfies FeeRevenueData,
    loading: false,
    error: null,
    refetch,
  };
}
