'use client';

import { useCallback, useState } from 'react';

export interface RecentlyViewedEntry {
  playerId: string;
  name: string;
  position: string;
  /** Unix ms timestamp of the most recent visit. */
  viewedAt: number;
}

const STORAGE_KEY = 'scoutoff_recently_viewed';
const MAX_ENTRIES = 10;

function getStoredEntries(): RecentlyViewedEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    // localStorage unavailable or corrupt value — start fresh
    return [];
  }
}

function setStoredEntries(entries: RecentlyViewedEntry[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // Silently ignore storage errors (private browsing, quota, etc.)
  }
}

/**
 * Tracks the scout's recently-viewed player profiles, client-side only via
 * localStorage — no backend dependency. Newest first, capped at
 * `MAX_ENTRIES`, deduplicated so re-viewing a player moves it back to front
 * instead of creating a second entry.
 */
export function useRecentlyViewed() {
  const [entries, setEntries] =
    useState<RecentlyViewedEntry[]>(getStoredEntries);

  const record = useCallback((entry: Omit<RecentlyViewedEntry, 'viewedAt'>) => {
    setEntries((prev) => {
      const filtered = prev.filter((e) => e.playerId !== entry.playerId);
      const next = [{ ...entry, viewedAt: Date.now() }, ...filtered].slice(
        0,
        MAX_ENTRIES,
      );
      setStoredEntries(next);
      return next;
    });
  }, []);

  return { entries, record };
}
