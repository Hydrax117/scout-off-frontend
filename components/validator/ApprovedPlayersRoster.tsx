'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useApprovedPlayers } from '@/hooks/useApprovedPlayers';
import PlayerCard from '@/components/PlayerCard';
import EmptyState from '@/components/ui/EmptyState';
import Button from '@/components/ui/Button';

interface ApprovedPlayersRosterProps {
  validatorAddress: string;
}

/**
 * Renders a roster of all players whose milestones the connected validator
 * has approved. Pulls data from the indexer and deduplicates to unique
 * players, then shows them in a card layout.
 */
export default function ApprovedPlayersRoster({
  validatorAddress,
}: ApprovedPlayersRosterProps) {
  const { players, loading, error, refetch } =
    useApprovedPlayers(validatorAddress);
  const pathname = usePathname();
  const locale = pathname?.split('/')[1] ?? 'en';

  if (loading) {
    return (
      <div className="bg-brand-card border border-gray-800 rounded-xl p-6">
        <h2 className="text-lg font-semibold text-white mb-4">
          My Approved Players
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[1, 2, 3].map((n) => (
            <div
              key={n}
              className="bg-gray-800/50 rounded-xl h-32 animate-pulse"
            />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-brand-card border border-gray-800 rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">
            My Approved Players
          </h2>
          <Button onClick={refetch} variant="secondary">
            Retry
          </Button>
        </div>
        <p className="text-red-400 text-sm">
          Could not load approved players. The indexer may be temporarily
          unavailable.
        </p>
      </div>
    );
  }

  if (players.length === 0) {
    return (
      <div className="bg-brand-card border border-gray-800 rounded-xl p-6">
        <h2 className="text-lg font-semibold text-white mb-4">
          My Approved Players
        </h2>
        <EmptyState
          title="No approved players yet"
          description="Players you approve milestones for will appear here. Use the search above to find and approve a player's milestone."
        />
      </div>
    );
  }

  return (
    <div className="bg-brand-card border border-gray-800 rounded-xl p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-white">
          My Approved Players
        </h2>
        <span className="text-sm text-gray-400">
          {players.length} player{players.length !== 1 ? 's' : ''}
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {players.map((player) => (
          <Link
            key={player.id}
            href={`/${locale}/player/${player.id}`}
            className="block hover:opacity-80 transition-opacity"
          >
            <PlayerCard player={player} />
          </Link>
        ))}
      </div>
    </div>
  );
}
