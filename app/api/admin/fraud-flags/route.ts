import { NextRequest, NextResponse } from 'next/server';
import { requireAdminWallet } from '@/lib/adminAuth';
import { runFraudFlagEvaluation } from '@/lib/fraudFlagsRunner';
import { FraudFlagsStore } from '@/lib/fraudFlagsStore';

export async function GET(req: NextRequest) {
  const sessionWallet = requireAdminWallet(req);

  if (!sessionWallet) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { flags, warnings } = await runFraudFlagEvaluation();
  const evaluatedAt = Date.now();
  FraudFlagsStore.getInstance().recordRun('manual', flags, warnings, evaluatedAt);

  return NextResponse.json({ flags, warnings, evaluatedAt });
}
