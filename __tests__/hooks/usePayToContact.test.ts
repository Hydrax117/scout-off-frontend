'use client';

import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react';
import { SWRConfig } from 'swr';
import { usePayToContact } from '@/hooks/usePayToContact';

const PUBLIC_KEY = 'G'.padEnd(56, 'X');

const mockUseWallet = jest.fn();
const mockShow = jest.fn();
const mockGetSubscription = jest.fn();
const mockPayToContact = jest.fn();
const mockRefreshBalance = jest.fn();
const mockCacheContactDetails = jest.fn();
const mockPurgeContactDetails = jest.fn();
const mockParseContractError = jest.fn();

jest.mock('@/hooks/useWallet', () => ({
  useWallet: () => mockUseWallet(),
}));

jest.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ show: mockShow }),
}));

jest.mock('@/lib/contract', () => ({
  getSubscription: (...args: unknown[]) => mockGetSubscription(...args),
  payToContact: (...args: unknown[]) => mockPayToContact(...args),
  PLATFORM_CONTACT_FEE_XLM: 1,
}));

jest.mock('@/lib/contactDetailsCache', () => ({
  cacheContactDetails: (...args: unknown[]) => mockCacheContactDetails(...args),
  contactDetailsKey: (playerId: string, wallet: string) =>
    `contact:${playerId}:${wallet}`,
  purgeContactDetails: (...args: unknown[]) => mockPurgeContactDetails(...args),
}));

jest.mock('@/lib/contractErrorMessage', () => ({
  parseContractError: (...args: unknown[]) => mockParseContractError(args[0]),
}));

function wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(
    SWRConfig,
    { value: { provider: () => new Map(), shouldRetryOnError: false } },
    children,
  );
}

const baseWallet = () => ({
  publicKey: PUBLIC_KEY,
  signOnly: jest.fn(),
  xlmBalance: '10',
  refreshBalance: mockRefreshBalance,
});

const baseSubscription = () => ({
  scout: PUBLIC_KEY,
  tier: 'basic',
  expiresAt: Math.floor(Date.now() / 1000) + 3600,
});

describe('usePayToContact', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseWallet.mockReturnValue(baseWallet());
    mockGetSubscription.mockReset();
    mockPayToContact.mockReset();
    mockRefreshBalance.mockReset();
    mockCacheContactDetails.mockReset();
    mockPurgeContactDetails.mockReset();
    mockParseContractError.mockImplementation((e: unknown) =>
      e instanceof Error ? e.message : 'unknown',
    );
    // Default happy path
    mockGetSubscription.mockResolvedValue(baseSubscription());
    mockPayToContact.mockResolvedValue({
      email: 'p@example.com',
      phone: null,
      telegram: null,
    });
    mockCacheContactDetails.mockResolvedValue(undefined);
    mockRefreshBalance.mockResolvedValue(undefined);
  });

  test('successful unlock: payToContact + cacheContactDetails + refreshBalance, no error', async () => {
    const { result } = renderHook(() => usePayToContact('p1'), { wrapper });

    await act(async () => {
      await result.current.unlock();
    });

    expect(mockPayToContact).toHaveBeenCalledTimes(1);
    expect(mockPayToContact).toHaveBeenCalledWith(
      PUBLIC_KEY,
      'p1',
      expect.any(Function),
    );
    expect(mockCacheContactDetails).toHaveBeenCalledWith(
      `contact:p1:${PUBLIC_KEY}`,
      {
        email: 'p@example.com',
        phone: null,
        telegram: null,
      },
    );
    expect(mockRefreshBalance).toHaveBeenCalledTimes(1);
    expect(result.current.error).toBeNull();
  });

  test('expired subscription: surfaces error, does not call payToContact or refreshBalance', async () => {
    // usePayToContact.fail() path on an expired subscription returns void;
    // no throw, so the await just resolves.
    mockGetSubscription.mockResolvedValueOnce({
      scout: PUBLIC_KEY,
      tier: 'basic',
      expiresAt: Math.floor(Date.now() / 1000) - 60,
    });

    const { result } = renderHook(() => usePayToContact('p1'), { wrapper });

    await act(async () => {
      await result.current.unlock();
    });

    expect(mockPayToContact).not.toHaveBeenCalled();
    expect(mockCacheContactDetails).not.toHaveBeenCalled();
    expect(mockRefreshBalance).not.toHaveBeenCalled();
    expect(result.current.error).toMatch(/subscription is required/i);
    expect(mockShow).toHaveBeenCalled();
  });

  test('insufficient balance: surfaces error, skips payToContact', async () => {
    mockUseWallet.mockReturnValue({ ...baseWallet(), xlmBalance: '0' });

    const { result } = renderHook(() => usePayToContact('p1'), { wrapper });

    await act(async () => {
      await result.current.unlock();
    });

    expect(mockPayToContact).not.toHaveBeenCalled();
    expect(result.current.error).toMatch(/insufficient xlm/i);
  });

  test('wallet not connected: surfaces error immediately, skips subscription fetch', async () => {
    mockUseWallet.mockReturnValue({ ...baseWallet(), publicKey: null });

    const { result } = renderHook(() => usePayToContact('p1'), { wrapper });

    await act(async () => {
      await result.current.unlock();
    });

    expect(mockGetSubscription).not.toHaveBeenCalled();
    expect(mockPayToContact).not.toHaveBeenCalled();
    expect(result.current.error).toMatch(/wallet not connected/i);
  });

  test('contract error from payToContact unmapped is re-thrown with parseContractError applied to error state', async () => {
    // Only this branch actually throws — the hook's catch block re-throws
    // after surfacing the parsed message via setError(), so the caller's
    // await rejects with the original error.
    mockPayToContact.mockRejectedValueOnce(new Error('ContractPaused'));
    mockParseContractError.mockReturnValueOnce(
      'Contract is paused. Try again later.',
    );

    const { result } = renderHook(() => usePayToContact('p1'), { wrapper });

    await act(async () => {
      await expect(result.current.unlock()).rejects.toThrow('ContractPaused');
    });

    expect(mockParseContractError).toHaveBeenCalled();
    expect(result.current.error).toBe('Contract is paused. Try again later.');
  });

  test('clear() calls purgeContactDetails with the same key unlock() targeted', async () => {
    const { result } = renderHook(() => usePayToContact('p1'), { wrapper });

    act(() => {
      result.current.clear();
    });

    expect(mockPurgeContactDetails).toHaveBeenCalledWith(
      `contact:p1:${PUBLIC_KEY}`,
    );
  });
});
