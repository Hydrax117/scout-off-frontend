import { NextRequest, NextResponse } from 'next/server';
import { getSessionWallet } from '@/lib/session';
import { NotificationPreferencesStore } from '@/lib/notificationPreferencesStore';
import { createRequestLogger } from '@/lib/logger';

export const runtime = 'nodejs';

/**
 * GET /api/notification-preferences
 *
 * Returns the authenticated wallet's notification category preferences,
 * defaulting to all-enabled if none have been saved yet.
 */
export async function GET(req: NextRequest) {
  const wallet = getSessionWallet(req);
  if (!wallet) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const log = createRequestLogger(req);
  try {
    const preferences = NotificationPreferencesStore.getInstance().get(wallet);
    return NextResponse.json(preferences);
  } catch (err) {
    log.error('Failed to load notification preferences', {
      reason: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: 'Failed to load notification preferences' },
      { status: 500 },
    );
  }
}

/**
 * PUT /api/notification-preferences
 *
 * Updates the authenticated wallet's notification category preferences.
 * Body: { milestoneApprovals: boolean, contactUnlocks: boolean }.
 */
export async function PUT(req: NextRequest) {
  const wallet = getSessionWallet(req);
  if (!wallet) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const log = createRequestLogger(req);
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { milestoneApprovals, contactUnlocks } = body as Record<
    string,
    unknown
  >;
  if (
    typeof milestoneApprovals !== 'boolean' ||
    typeof contactUnlocks !== 'boolean'
  ) {
    return NextResponse.json(
      {
        error: 'milestoneApprovals and contactUnlocks must both be booleans',
      },
      { status: 400 },
    );
  }

  try {
    const preferences = NotificationPreferencesStore.getInstance().set(wallet, {
      milestoneApprovals,
      contactUnlocks,
    });
    return NextResponse.json(preferences);
  } catch (err) {
    log.error('Failed to update notification preferences', {
      reason: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: 'Failed to update notification preferences' },
      { status: 500 },
    );
  }
}
