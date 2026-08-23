'use client';

import Link from 'next/link';
import TruncatedAddress from '@/components/ui/TruncatedAddress';
import EmptyState from '@/components/ui/EmptyState';
import type { LeaderboardEntry } from './data';

interface LeaderboardContentProps {
  entries: LeaderboardEntry[];
}

export default function LeaderboardContent({ entries }: LeaderboardContentProps) {
  if (entries.length === 0) {
    return (
      <div className="bg-brand-card border border-gray-800 rounded-xl p-6">
        <EmptyState
          title="No validators yet"
          description="Once validators are added to the contract, they'll appear here ranked by approvals."
        />
      </div>
    );
  }

  return (
    <>
      <div className="bg-brand-card border border-gray-800 rounded-xl overflow-x-auto">
        <table className="w-full text-sm text-left">
          <caption className="sr-only">
            Validators ranked by approval count
          </caption>
          <thead>
            <tr className="border-b border-gray-800 text-gray-400">
              <th scope="col" className="py-3 pl-6 pr-4 font-medium">
                Rank
              </th>
              <th scope="col" className="py-3 pr-4 font-medium">
                Validator
              </th>
              <th scope="col" className="py-3 pr-4 font-medium">
                Approvals
              </th>
              <th scope="col" className="py-3 pr-6 font-medium">
                Reputation Score
              </th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry, i) => (
              <tr
                key={entry.address}
                className="border-b border-gray-800/60 last:border-0"
              >
                <td className="py-3 pl-6 pr-4 text-gray-400 font-mono">
                  {i + 1}
                </td>
                <td className="py-3 pr-4">
                  {entry.isAcademy ? (
                    <span className="text-white font-medium">
                      {entry.displayName}
                    </span>
                  ) : (
                    <TruncatedAddress
                      address={entry.address}
                      className="text-white"
                    />
                  )}
                </td>
                <td className="py-3 pr-4 text-gray-300">
                  {entry.approvalCount !== null ? entry.approvalCount : '—'}
                </td>
                <td className="py-3 pr-6 text-gray-300">
                  {entry.approvalCount !== null
                    ? entry.approvalCount
                    : 'Unavailable'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Link
        href="/validator"
        className="self-start text-sm text-gray-400 hover:text-white transition"
      >
        ← Back to Validator Dashboard
      </Link>
    </>
  );
}
