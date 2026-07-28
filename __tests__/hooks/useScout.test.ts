'use client';

import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react';
import { SWRConfig } from 'swr';
import { useScout } from '@/hooks/useScout';
import { SearchRateLimitedError } from '@/lib/api';
import type { Player } from '@/types';

const mockFilterPlayers = jest.fn();
const mockSearchPlayersByName = jest.fn();

jest.mock('@/lib/contract', () => ({
  filterPlayers: (...args: unknown[]) => mockFilterPlayers(...args),
}));

jest.mock('@/lib/api', () => ({
  searchPlayersByName: (...args: unknown[]) => mockSearchPlayersByName(...args),
  SearchRateLimitedError: class SearchRateLimitedError extends Error {
    public retryAfterSec: number;
    constructor(message: string, retryAfterSec: number) {
      super(message);
      this.name = 'SearchRateLimitedError';
      this.retryAfterSec = retryAfterSec;
    }
  },
}));

function wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(
    SWRConfig,
    { value: { provider: () => new Map(), shouldRetryOnError: false } },
    children,
  );
}

const makePlayer = (id: string, archived = false): Player =>
  ({
    id,
    wallet: `G${'X'.repeat(55)}`,
    vitals: {
      name: `Test ${id}`,
      position: 'forward',
      region: 'EU',
      age: 20,
      nationality: 'US',
    },
    progressLevel: 1,
    archived,
    milestones: [],
    stats: { matches: 10, goals: 5, assists: 2 },
    ipfsHash: '',
  }) as unknown as Player;

describe('useScout', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFilterPlayers.mockReset();
    mockSearchPlayersByName.mockReset();
  });

  test('search(filter) populates players and filters out archived profiles', async () => {
    mockFilterPlayers.mockResolvedValueOnce([
      makePlayer('p1'),
      makePlayer('p2', true),
      makePlayer('p3'),
    ]);

    const { result } = renderHook(() => useScout(), { wrapper });

    act(() =>
      result.current.search({
        region: 'EU',
        position: 'forward',
        minLevel: 0,
      }),
    );

    await waitFor(() =>
      expect(result.current.players.map((p) => p.id)).toEqual(['p1', 'p3']),
    );

    expect(mockFilterPlayers).toHaveBeenCalledWith('EU', 'forward', 0);
    expect(result.current.error).toBeNull();
    expect(result.current.isRateLimited).toBe(false);
  });

  test('searchByName routes to searchPlayersByName and excludes archived', async () => {
    mockSearchPlayersByName.mockResolvedValueOnce([
      makePlayer('n1'),
      makePlayer('n2', true),
    ]);

    const { result } = renderHook(() => useScout(), { wrapper });

    act(() => result.current.searchByName('alice'));

    await waitFor(() =>
      expect(result.current.players.map((p) => p.id)).toEqual(['n1']),
    );

    expect(mockSearchPlayersByName).toHaveBeenCalledWith('alice');
    expect(mockFilterPlayers).not.toHaveBeenCalled();
  });

  test('SearchRateLimitedError surfaces isRateLimited + retryAfterSec', async () => {
    mockFilterPlayers.mockRejectedValueOnce(
      new SearchRateLimitedError('slow down', 42),
    );

    const { result } = renderHook(() => useScout(), { wrapper });

    act(() =>
      result.current.search({
        region: 'EU',
        position: 'forward',
        minLevel: 0,
      }),
    );

    await waitFor(() => expect(result.current.error).toMatch(/slow down/));

    expect(result.current.isRateLimited).toBe(true);
    expect(result.current.retryAfterSec).toBe(42);
  });

  test('non-rate-limit error surfaces message verbatim and isRateLimited=false', async () => {
    mockFilterPlayers.mockRejectedValueOnce(new Error('RPC failed'));

    const { result } = renderHook(() => useScout(), { wrapper });

    act(() =>
      result.current.search({
        region: 'EU',
        position: 'forward',
        minLevel: 0,
      }),
    );

    await waitFor(() => expect(result.current.error).toBe('RPC failed'));
    expect(result.current.isRateLimited).toBe(false);
    expect(result.current.retryAfterSec).toBeNull();
  });

  test('empty result is not an error (Falsy array, not null)', async () => {
    mockFilterPlayers.mockResolvedValueOnce([]);

    const { result } = renderHook(() => useScout(), { wrapper });

    act(() =>
      result.current.search({
        region: '',
        position: '',
        minLevel: 0,
      }),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.players).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  test('refetch re-runs the in-flight search (mutate is called)', async () => {
    mockFilterPlayers.mockResolvedValue([makePlayer('p1')]);

    const { result } = renderHook(() => useScout(), { wrapper });

    act(() =>
      result.current.search({
        region: '',
        position: '',
        minLevel: 0,
      }),
    );

    await waitFor(() => expect(result.current.players.length).toBe(1));
    const callsBefore = mockFilterPlayers.mock.calls.length;

    await act(async () => {
      await result.current.refetch();
    });

    expect(mockFilterPlayers.mock.calls.length).toBeGreaterThan(callsBefore);
  });
});
