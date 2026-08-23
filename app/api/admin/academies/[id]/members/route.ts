import { NextRequest, NextResponse } from 'next/server';
import api from '@/lib/api';
import { requireAdminWallet } from '@/lib/adminAuth';

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
