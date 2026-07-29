'use client';

import { useState } from 'react';
import { mutate as globalMutate } from 'swr';
import { useWallet } from '@/hooks/useWallet';
import { useDisputeQueue } from '@/hooks/useDisputeQueue';
import { buildRevokeMilestone } from '@/lib/contract';
import { parseContractError } from '@/lib/contractErrorMessage';
import EmptyState from '@/components/ui/EmptyState';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import TruncatedAddress from '@/components/ui/TruncatedAddress';
import type { MilestoneDispute } from '@/types';

type PendingAction = 'upheld' | 'reversed' | null;

function DisputeCard({
  dispute,
  onDecide,
}: {
  dispute: MilestoneDispute;
  onDecide: (
    id: number,
    decision: {
      status: 'upheld' | 'reversed';
      resolutionNote?: string;
      revokeTxHash?: string;
    },
  ) => Promise<MilestoneDispute>;
}) {
  const { publicKey, signAndSubmit } = useWallet();
  const [note, setNote] = useState('');
  const [confirming, setConfirming] = useState<PendingAction>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    if (!confirming) return;
    setWorking(true);
    setError(null);
    try {
      if (confirming === 'reversed') {
        if (!publicKey) throw new Error('Wallet not connected');
        const xdr = await buildRevokeMilestone(
          publicKey,
          dispute.playerId,
          dispute.milestoneId,
        );
        const txHash = await signAndSubmit(xdr);
        await globalMutate(`player:${dispute.playerId}`);
        await globalMutate(`milestones:${dispute.playerId}`);
        await onDecide(dispute.id, {
          status: 'reversed',
          resolutionNote: note.trim() || undefined,
          revokeTxHash: txHash,
        });
      } else {
        await onDecide(dispute.id, {
          status: 'upheld',
          resolutionNote: note.trim() || undefined,
        });
      }
      setConfirming(null);
    } catch (err) {
      setError(parseContractError(err));
    } finally {
      setWorking(false);
    }
  }

  return (
    <li className="rounded-lg border border-gray-800 bg-gray-900/40 p-4 flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <TruncatedAddress
          address={dispute.playerWallet}
          className="text-gray-400"
        />
        <span className="text-xs text-gray-600">
          {new Date(dispute.createdAt).toLocaleDateString(undefined, {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
          })}
        </span>
      </div>

      <p className="text-sm text-gray-200">
        <span className="text-gray-500">Milestone: </span>
        {dispute.milestoneDescription}
      </p>

      <p className="text-sm text-gray-300">{dispute.reason}</p>

      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Optional resolution note…"
        rows={2}
        className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-xs text-white placeholder-gray-500 focus:border-brand-green focus:outline-none"
      />

      {error && (
        <p role="alert" className="text-xs text-red-400">
          {error}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setConfirming('upheld')}
          className="rounded-lg border border-gray-700 px-3 py-1.5 text-xs font-medium text-gray-300 hover:bg-gray-800 transition"
        >
          Uphold decision
        </button>
        <button
          type="button"
          onClick={() => setConfirming('reversed')}
          className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-400 hover:bg-red-500/20 transition"
        >
          Reverse &amp; revoke milestone
        </button>
      </div>

      <ConfirmDialog
        isOpen={confirming !== null}
        onConfirm={handleConfirm}
        onCancel={() => setConfirming(null)}
        loading={working}
        title={
          confirming === 'reversed' ? 'Reverse milestone' : 'Uphold decision'
        }
        message={
          confirming === 'reversed'
            ? 'This will submit an on-chain revoke_milestone transaction (requires your wallet to be an authorized validator) and mark the dispute as reversed. This cannot be undone.'
            : 'This closes the dispute without changing the milestone. The original decision stands.'
        }
        confirmLabel={confirming === 'reversed' ? 'Reverse' : 'Uphold'}
      />
    </li>
  );
}

/**
 * Admin review queue for milestone disputes (issue #562). Reversing a
 * dispute reuses the existing validator revoke_milestone flow — the same
 * contract call RevokeForm makes — so the admin wallet must itself be an
 * authorized validator for the reversal to succeed on-chain; the dispute
 * record only gets its 'reversed' status once that transaction lands.
 */
export default function DisputedMilestonesPanel() {
  const { disputes, loading, error, decide } = useDisputeQueue('pending');

  return (
    <section className="bg-brand-card border border-gray-800 rounded-xl p-6 flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold text-white">
          Disputed Milestones
        </h2>
        <p className="text-sm text-gray-400 mt-1">
          Players flagged these milestone decisions for review. Uphold closes
          the dispute as-is; reversing submits an on-chain revoke_milestone
          transaction (requires your wallet to be an authorized validator).
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : error ? (
        <p role="alert" className="text-sm text-red-400">
          Failed to load disputed milestones.
        </p>
      ) : disputes.length === 0 ? (
        <EmptyState
          title="No disputed milestones"
          description="Milestones flagged by players for review will appear here."
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {disputes.map((dispute) => (
            <DisputeCard key={dispute.id} dispute={dispute} onDecide={decide} />
          ))}
        </ul>
      )}
    </section>
  );
}
