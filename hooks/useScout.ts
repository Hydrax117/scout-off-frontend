'use client';
import { useState, useCallback } from 'react';
import useSWR, { mutate as globalMutate } from 'swr';
import { filterPlayers } from '@/lib/contract';
import { searchPlayersByName, SearchRateLimitedError } from '@/lib/api';
import type { Player, PlayerFilter } from '@/types';

/**
 * Cache key scheme for useScout:
 *   "scout:search:{region}:{position}:{minLevel}"
 *
 * All filter dimensions are encoded in the key so different filter combos
 * get separate cache entries. SWR deduplicates concurrent requests for the
 * same key, preventing duplicate RPC calls within the deduplication window.
 */
export function scoutSearchKey(filter: PlayerFilter): string {
  return `scout:search:${filter.region ?? ''}:${filter.position ?? ''}:${filter.minLevel ?? 0}`;
}

/**
 * Imperatively invalidate a specific scout search result.
 * Call after a write operation that changes the player list (e.g. registration).
 */
export function invalidateScoutSearch(filter: PlayerFilter): Promise<void> {
  return globalMutate(scoutSearchKey(filter)) as Promise<void>;
}

export function useScout() {
  const [searchKey, setSearchKey] = useState<string | null>(null);

  const { data, error, isValidating, mutate } = useSWR<Player[]>(
    searchKey,
    async (key: string) => {
      if (key.startsWith('scout:name:')) {
        const name = key.slice('scout:name:'.length);
        const results = await searchPlayersByName(name);
        // Filter out archived profiles
        return results.filter((p) => !p.archived);
      }
      // contract filter key: "scout:contract:{region}:{position}:{minLevel}"
      const parts = key.split(':');
      const region = parts[2] ?? '';
      const position = parts[3] ?? '';
      const minLevel = Number(parts[4] ?? 0);
      const results = await filterPlayers(region, position, minLevel);
      // Filter out archived profiles
      return (results as Player[]).filter((p) => !p.archived);
    },
    {
      dedupingInterval: 60_000,
      revalidateOnFocus: false,
      errorRetryCount: 2,
    },
  );

  /** Trigger a search with the given filter. */
  const search = useCallback((filter: PlayerFilter) => {
    setSearchKey(scoutSearchKey(filter));
  }, []);

  const searchByName = useCallback((name: string) => {
    setSearchKey(`scout:name:${name}`);
  }, []);

  return {
    players: data ?? [],
    loading: isValidating,
    error: error?.message ?? null,
    isRateLimited: error instanceof SearchRateLimitedError,
    retryAfterSec:
      error instanceof SearchRateLimitedError ? error.retryAfterSec : null,
    search,
    searchByName,
    refetch: () => mutate() as Promise<void>,
  };
}
