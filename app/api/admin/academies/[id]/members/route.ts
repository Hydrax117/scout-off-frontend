import { NextRequest, NextResponse } from 'next/server';
import api from '@/lib/api';
import { requireAdminWallet } from '@/lib/adminAuth';

// Stellar public key: 'G' followed by 55 uppercase base32 characters (A-Z, 2-7).
const STELLAR_PUBLIC_KEY_RE = /^G[A-Z2-7]{55}$/;

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const admin = requireAdminWallet(req);
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { wallet } = await req.json().catch(() => ({}));
  if (typeof wallet !== 'string' || !wallet.trim()) {
    return NextResponse.json({ error: 'wallet is required' }, { status: 400 });
  }

  if (!STELLAR_PUBLIC_KEY_RE.test(wallet.trim())) {
    return NextResponse.json(
      { error: 'wallet must be a valid Stellar public key' },
      { status: 400 },
    );
  }

  try {
    const academy = await api
      .post(`/academies/${encodeURIComponent(params.id)}/members`, {
        wallet,
        addedBy: admin,
      })
      .then((r) => r.data);
    return NextResponse.json(academy, { status: 201 });
  } catch (err: any) {
    const status = err?.response?.status ?? 502;
    const message = err?.response?.data?.error ?? 'Failed to add signer wallet';
    return NextResponse.json({ error: message }, { status });
  }
}
