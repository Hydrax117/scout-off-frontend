import { NextRequest, NextResponse } from 'next/server';
import api from '@/lib/api';

const ADMIN_ADDRESS = process.env.NEXT_PUBLIC_ADMIN_ADDRESS;

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const sessionCookie = req.cookies.get('session')?.value;
  if (!sessionCookie || sessionCookie !== ADMIN_ADDRESS) {
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
        addedBy: sessionCookie,
      })
      .then((r) => r.data);
    return NextResponse.json(academy, { status: 201 });
  } catch (err: any) {
    const status = err?.response?.status ?? 502;
    const message = err?.response?.data?.error ?? 'Failed to add signer wallet';
    return NextResponse.json({ error: message }, { status });
  }
}
