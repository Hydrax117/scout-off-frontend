import { NextRequest, NextResponse } from 'next/server';
import { getSessionWallet } from '@/lib/session';
import { requireAdminWallet } from '@/lib/adminAuth';
import {
  MilestoneDisputeStore,
  DuplicateDisputeError,
} from '@/lib/milestoneDisputeStore';
import { createRequestLogger } from '@/lib/logger';
import type { MilestoneDisputeStatus } from '@/types';

export const runtime = 'nodejs';

const VALID_STATUSES: MilestoneDisputeStatus[] = [
  'pending',
  'upheld',
  'reversed',
];

/**
 * GET /api/disputes
 *
 * Admins (session wallet === NEXT_PUBLIC_ADMIN_ADDRESS) see the full review
 * queue, optionally filtered by `?status=`. Everyone else sees only their
 * own disputes.
 */
export async function GET(req: NextRequest) {
  const wallet = getSessionWallet(req);
  if (!wallet) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const log = createRequestLogger(req);
  const isAdmin = requireAdminWallet(req) !== null;
  const statusParam = req.nextUrl.searchParams.get('status');

  if (
    statusParam &&
    !VALID_STATUSES.includes(statusParam as MilestoneDisputeStatus)
  ) {
    return NextResponse.json(
      { error: 'Invalid status filter' },
      { status: 400 },
    );
  }

  try {
    const store = MilestoneDisputeStore.getInstance();
    const disputes = isAdmin
      ? store.listAll(statusParam as MilestoneDisputeStatus | undefined)
      : store.listForWallet(wallet);
    return NextResponse.json(disputes);
  } catch (err) {
    log.error('Failed to list disputes', {
      reason: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: 'Failed to load disputes' },
      { status: 500 },
    );
  }
}

/**
 * POST /api/disputes
 *
 * Files a new dispute for one of the caller's own milestones.
 * Body: { playerId, milestoneId, milestoneDescription, reason }.
 */
export async function POST(req: NextRequest) {
  const wallet = getSessionWallet(req);
  if (!wallet) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const log = createRequestLogger(req);
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { playerId, milestoneId, milestoneDescription, reason } =
    body as Record<string, unknown>;

  if (
    typeof playerId !== 'string' ||
    !playerId.trim() ||
    typeof milestoneId !== 'string' ||
    !milestoneId.trim() ||
    typeof milestoneDescription !== 'string' ||
    typeof reason !== 'string' ||
    reason.trim().length < 10
  ) {
    return NextResponse.json(
      {
        error:
          'playerId, milestoneId, and milestoneDescription are required, and reason must be at least 10 characters',
      },
      { status: 400 },
    );
  }

  try {
    const dispute = MilestoneDisputeStore.getInstance().create({
      playerId,
      playerWallet: wallet,
      milestoneId,
      milestoneDescription,
      reason: reason.trim(),
    });
    return NextResponse.json(dispute, { status: 201 });
  } catch (err) {
    if (err instanceof DuplicateDisputeError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    log.error('Failed to create dispute', {
      reason: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: 'Failed to create dispute' },
      { status: 500 },
    );
  }
}
