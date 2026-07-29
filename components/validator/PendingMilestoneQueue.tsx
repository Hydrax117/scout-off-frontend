'use client';

import { useMemo, useState } from 'react';
import { useValidatorPendingQueue } from '@/hooks/useValidatorPendingQueue';
import { useApprovedPlayers } from '@/hooks/useApprovedPlayers';
import Select from '@/components/ui/Select';
import EmptyState from '@/components/ui/EmptyState';
import Button from '@/components/ui/Button';
import type { MilestoneSubmission } from '@/types';

type SortOrder = 'oldest' | 'newest';
type PlayerFilter = 'all' | 'previously-approved';

interface PendingMilestoneQueueProps {
  validatorAddress: string;
}

function sortSubmissions(
  submissions: MilestoneSubmission[],
  order: SortOrder,
): MilestoneSubmission[] {
  const sorted = [...submissions].sort((a, b) => a.createdAt - b.createdAt);
  return order === 'newest' ? sorted.reverse() : sorted;
}

export default function PendingMilestoneQueue({
  validatorAddress,
}: PendingMilestoneQueueProps) {
  const { submissions, loading, error, refetch } =
    useValidatorPendingQueue(validatorAddress);
  const { players: approvedPlayers } = useApprovedPlayers(validatorAddress);

  const [sortOrder, setSortOrder] = useState<SortOrder>('oldest');
  const [playerFilter, setPlayerFilter] = useState<PlayerFilter>('all');

  const previouslyApprovedIds = useMemo(
    () => new Set(approvedPlayers.map((p) => p.id)),
    [approvedPlayers],
  );

  // Sort/filter apply instantly client-side — no refetch or page reload.
  const visibleSubmissions = useMemo(() => {
    const filtered =
      playerFilter === 'previously-approved'
        ? submissions.filter((s) => previouslyApprovedIds.has(s.playerId))
        : submissions;
    return sortSubmissions(filtered, sortOrder);
  }, [submissions, playerFilter, previouslyApprovedIds, sortOrder]);

  return (
    <div className="bg-brand-card border border-gray-800 rounded-xl p-6 flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-lg font-semibold text-white">Pending Milestones</h2>
        {!loading && !error && (
          <span className="text-sm text-gray-400">
            {visibleSubmissions.length} pending
          </span>
        )}
      </div>

      <div className="flex flex-wrap gap-4">
        <Select
          id="pending-queue-sort"
          label="Sort"
          className="w-40"
          value={sortOrder}
          onChange={(e) => setSortOrder(e.target.value as SortOrder)}
        >
          <option value="oldest">Oldest first</option>
          <option value="newest">Newest first</option>
        </Select>

        <Select
          id="pending-queue-filter"
          label="Filter"
          className="w-56"
          value={playerFilter}
          onChange={(e) => setPlayerFilter(e.target.value as PlayerFilter)}
        >
          <option value="all">All players</option>
          <option value="previously-approved">
            Only players I&apos;ve previously approved
          </option>
        </Select>
      </div>

      {loading && (
        <div className="flex flex-col gap-3">
          {[1, 2, 3].map((n) => (
            <div key={n} className="h-16 rounded-lg bg-gray-800/50 animate-pulse" />
          ))}
        </div>
      )}

      {!loading && error && (
        <div className="flex items-center justify-between">
          <p className="text-red-400 text-sm">
            Could not load pending milestones.
          </p>
          <Button variant="secondary" onClick={refetch}>
            Retry
          </Button>
        </div>
      )}

      {!loading && !error && visibleSubmissions.length === 0 && (
        <EmptyState
          title="No pending milestones"
          description={
            playerFilter === 'previously-approved'
              ? "No pending submissions from players you've previously approved."
              : 'New submissions from players will appear here for review.'
          }
        />
      )}

      {!loading && !error && visibleSubmissions.length > 0 && (
        <ul className="flex flex-col gap-3">
          {visibleSubmissions.map((submission) => (
            <li
              key={submission.id}
              className="border border-gray-700 rounded-lg p-4 flex flex-col gap-1"
            >
              <div className="flex items-center justify-between gap-4">
                <span className="text-white font-medium">
                  {submission.playerName ?? submission.playerId}
                </span>
                <span className="text-xs text-gray-400">
                  {new Date(submission.createdAt).toLocaleDateString(undefined, {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                  })}
                </span>
              </div>
              <p className="text-sm text-gray-300">{submission.description}</p>
              {submission.evidenceUrl && (
                <a
                  href={submission.evidenceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-brand-green underline underline-offset-2 hover:opacity-80 w-fit"
                >
                  View evidence
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
