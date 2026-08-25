'use client';
import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { SWRConfig } from 'swr';
import { useSubscription } from '@/hooks/useSubscription';

// Mock useWallet
jest.mock('@/hooks/useWallet', () => ({
  useWallet: jest.fn(),
}));

// Mock lib/contract
jest.mock('@/lib/contract', () => ({
  getSubscription: jest.fn(),
  subscribe: jest.fn(),
}));

import { useWallet } from '@/hooks/useWallet';
import {
  getSubscription,
  subscribe as contractSubscribe,
} from '@/lib/contract';

const mockUseWallet = useWallet as jest.Mock;
const mockGetSubscription = getSubscription as jest.Mock;
const mockSubscribe = contractSubscribe as jest.Mock;

function wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(
    SWRConfig,
    { value: { provider: () => new Map(), shouldRetryOnError: false } },
    children,
  );
}

describe('useSubscription', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  test('isExpired is true when expiresAt is in the past', async () => {
    const mockPublicKey = 'GABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890';
    mockUseWallet.mockReturnValue({ publicKey: mockPublicKey });

    const mockSubscription = {
      scout: mockPublicKey,
      tier: 'basic',
      expiresAt: Date.now() / 1000 - 1000,
    };
    mockGetSubscription.mockResolvedValue(mockSubscription);

    const { result } = renderHook(() => useSubscription(), { wrapper });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(result.current.isExpired).toBe(true);
  });

  test('isExpired is false when expiresAt is in the future', async () => {
    const mockPublicKey = 'GABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890';
    mockUseWallet.mockReturnValue({ publicKey: mockPublicKey });

    const mockSubscription = {
      scout: mockPublicKey,
      tier: 'basic',
      expiresAt: Date.now() / 1000 + 1000,
    };
    mockGetSubscription.mockResolvedValue(mockSubscription);

    const { result } = renderHook(() => useSubscription(), { wrapper });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(result.current.isExpired).toBe(false);
  });

  test('subscribe(tier) calls subscribe from contract then fetchSubscription', async () => {
    const mockPublicKey = 'GABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890';
    const mockSignAndSubmit = jest.fn();
    mockUseWallet.mockReturnValue({
      publicKey: mockPublicKey,
      signAndSubmit: mockSignAndSubmit,
    });

    const mockSubscription = {
      scout: mockPublicKey,
      tier: 'pro',
      expiresAt: Date.now() / 1000 + 1000,
    };
    mockSubscribe.mockResolvedValue(undefined);
    mockGetSubscription.mockResolvedValue(mockSubscription);

    const { result } = renderHook(() => useSubscription(), { wrapper });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    await act(async () => {
      await result.current.subscribe('pro');
    });

    expect(mockSubscribe).toHaveBeenCalledWith(
      mockPublicKey,
      'pro',
      mockSignAndSubmit,
    );
    expect(mockGetSubscription).toHaveBeenCalledTimes(2);
  });

  test('a rapid double-click on subscribe() builds/signs/submits only one transaction (issue #1177)', async () => {
    const mockPublicKey = 'GABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890';
    const mockSignAndSubmit = jest.fn();
    mockUseWallet.mockReturnValue({
      publicKey: mockPublicKey,
      signAndSubmit: mockSignAndSubmit,
    });
    mockGetSubscription.mockResolvedValue(null);

    let resolveSubscribe: () => void;
    mockSubscribe.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        resolveSubscribe = resolve;
      }),
    );

    const { result } = renderHook(() => useSubscription(), { wrapper });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    let first: Promise<void>;
    let second: Promise<void>;
    act(() => {
      // Both calls fire before the contract call's promise ever resolves —
      // simulates a fast double-click before the disabled state visually
      // registers.
      first = result.current.subscribe('pro');
      second = result.current.subscribe('pro');
    });

    await act(async () => {
      resolveSubscribe!();
      await Promise.all([first, second]);
    });

    expect(mockSubscribe).toHaveBeenCalledTimes(1);
  });

  test('InsufficientFee error is surfaced in the error state', async () => {
    const mockPublicKey = 'GABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890';
    mockUseWallet.mockReturnValue({ publicKey: mockPublicKey });

    mockSubscribe.mockRejectedValue(new Error('InsufficientFee'));
    mockGetSubscription.mockResolvedValue(null);

    const { result } = renderHook(() => useSubscription(), { wrapper });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    let caughtError: unknown;
    await act(async () => {
      try {
        await result.current.subscribe('basic');
      } catch (e) {
        caughtError = e;
      }
    });

    expect(caughtError).toBeInstanceOf(Error);
    expect((caughtError as Error).message).toBe('InsufficientFee');
    expect(result.current.error).toBe('InsufficientFee');
  });
});
