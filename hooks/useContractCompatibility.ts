'use client';
import { useEffect, useState } from 'react';
import {
  checkContractCompatibility,
  type ContractCompatibility,
} from '@/lib/contract';

/**
 * Runs the contract-version compatibility check once on mount (effectively
 * "on app load" for whichever page first mounts it) and exposes the result.
 * The underlying check is cached in lib/contract.ts, so mounting this from
 * multiple components does not trigger repeated RPC calls.
 */
export function useContractCompatibility() {
  const [data, setData] = useState<ContractCompatibility | null>(null);

  useEffect(() => {
    let cancelled = false;
    checkContractCompatibility().then((result) => {
      if (!cancelled) setData(result);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return {
    status: data?.status ?? 'unknown',
    message: data?.message ?? null,
    isIncompatible: data?.status === 'incompatible',
    isLoading: data === null,
  };
}
