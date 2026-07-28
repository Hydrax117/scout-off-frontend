'use client';

import { useContractCompatibility } from '@/hooks/useContractCompatibility';

/**
 * Blocking banner shown when the deployed contract's version doesn't match
 * what this app build expects. Unlike ContractPausedBanner, this is not
 * dismissible — an ABI mismatch means write actions will fail regardless of
 * whether the user acknowledges the message.
 */
export default function ContractIncompatibleBanner() {
  const { isIncompatible, message } = useContractCompatibility();

  if (!isIncompatible) return null;

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="w-full bg-red-600 text-white px-4 py-3 sticky top-0 z-50 border-b border-red-800"
    >
      <strong className="font-semibold">Contract update required.</strong>{' '}
      <span className="text-sm">
        {message ??
          'This app version is out of sync with the deployed contract. Please refresh or check for an update.'}
      </span>
    </div>
  );
}
