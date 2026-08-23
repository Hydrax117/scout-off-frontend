'use client';

import { useCallback, useMemo } from 'react';
import useSWR from 'swr';
import { fetchBlockedUsers, getBlockedUsers } from '@/lib/messaging/moderation';

const BLOCKED_USERS_SWR_KEY = 'blocked-users';

/**
 * The authoritative "is this user blocked" state, sourced from the server.
 *
 * localStorage (via getBlockedUsers) only ever reflects blocks made from
 * the current browser, so it's used here purely as an optimistic seed to
 * avoid a UI flash while the server fetch is in flight — the server
 * response always wins once it resolves, whether that means confirming a
 * block made on another device or overriding a corrupted/stale local
 * cache.
 */
export function useBlockedUsers() {
  const { data, error, isValidating, mutate } = useSWR(
    BLOCKED_USERS_SWR_KEY,
    fetchBlockedUsers,
    {
      fallbackData: getBlockedUsers(),
      revalidateOnFocus: false,
      errorRetryCount: 2,
    },
  );

  const refetch = useCallback(() => mutate(), [mutate]);

  const blockedIds = useMemo(
    () => new Set((data ?? []).map((b) => b.userId)),
    [data],
  );

  const isBlocked = useCallback(
    (counterpartId: string) => blockedIds.has(counterpartId),
    [blockedIds],
  );

  return {
    blockedIds,
    isBlocked,
    loading: isValidating && !data,
    error: error?.message ?? null,
    refetch,
  };
}
