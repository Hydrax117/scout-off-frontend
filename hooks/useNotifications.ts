'use client';

import { useCallback } from 'react';
import useSWR from 'swr';
import { fetchEvents, type IndexedEvent } from '@/lib/indexerClient';
import {
  fetchReadNotificationIds,
  markNotificationsRead,
} from '@/lib/notificationsClient';
import {
  deriveNotifications,
  applyNotificationPreferences,
} from '@/lib/notifications';
import { useNotificationPreferences } from './useNotificationPreferences';
import type { Notification } from '@/types';

// Same page cap as useMilestoneHistory/useSpendingSummary: 10 * 200 = 2000
// events scanned (newest-first) before giving up.
const MAX_PAGES = 10;
const PAGE_SIZE = 200;

async function loadRecentEvents(): Promise<IndexedEvent[]> {
  const all: IndexedEvent[] = [];
  let cursor: number | undefined;

  for (let page = 0; page < MAX_PAGES; page++) {
    const { events, nextCursor } = await fetchEvents({
      limit: PAGE_SIZE,
      before: cursor,
    });
    all.push(...events);
    if (nextCursor === null || events.length === 0) break;
    cursor = nextCursor;
  }

  return all;
}

/** SWR key for the current wallet's notification-center cache. */
export function notificationsKey(wallet: string | null): string | null {
  return wallet ? `notifications:${wallet}` : null;
}

/**
 * Drives the notification bell + panel (issue #557) and its unread badge
 * (issue #559): pulls recent wallet-relevant events from the indexer,
 * overlays server-persisted read state, and filters by the wallet's saved
 * category preferences (issue #560).
 */
export function useNotifications(wallet: string | null) {
  const { preferences } = useNotificationPreferences(wallet);

  const { data, error, isValidating, mutate } = useSWR<Notification[]>(
    notificationsKey(wallet),
    async () => {
      const [events, readIds] = await Promise.all([
        loadRecentEvents(),
        fetchReadNotificationIds(),
      ]);
      const readSet = new Set(readIds);
      return deriveNotifications(events, wallet!).map((n) => ({
        ...n,
        read: readSet.has(n.id),
      }));
    },
    {
      dedupingInterval: 15_000,
      revalidateOnFocus: false,
      refreshInterval: 60_000,
      errorRetryCount: 2,
    },
  );

  const notifications = applyNotificationPreferences(data ?? [], preferences);
  const unreadCount = notifications.filter((n) => !n.read).length;

  const markRead = useCallback(
    async (id: number) => {
      mutate(
        (current) =>
          (current ?? []).map((n) => (n.id === id ? { ...n, read: true } : n)),
        false,
      );
      try {
        await markNotificationsRead([id]);
      } finally {
        mutate();
      }
    },
    [mutate],
  );

  const markAllRead = useCallback(async () => {
    const unreadIds = notifications.filter((n) => !n.read).map((n) => n.id);
    if (unreadIds.length === 0) return;
    mutate(
      (current) => (current ?? []).map((n) => ({ ...n, read: true })),
      false,
    );
    try {
      await markNotificationsRead(unreadIds);
    } finally {
      mutate();
    }
  }, [notifications, mutate]);

  return {
    notifications,
    unreadCount,
    loading: isValidating && !data,
    error: error?.message ?? null,
    markRead,
    markAllRead,
  };
}
