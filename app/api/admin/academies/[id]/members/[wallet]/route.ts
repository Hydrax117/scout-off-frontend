import { NextRequest, NextResponse } from 'next/server';
import api from '@/lib/api';

const ADMIN_ADDRESS = process.env.NEXT_PUBLIC_ADMIN_ADDRESS;

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string; wallet: string } },
) {
  const sessionCookie = req.cookies.get('session')?.value;
  if (!sessionCookie || sessionCookie !== ADMIN_ADDRESS) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await api.delete(
      `/academies/${encodeURIComponent(params.id)}/members/${encodeURIComponent(params.wallet)}`,
    );
    return NextResponse.json({ success: true });
  } catch (err: any) {
    const status = err?.response?.status ?? 502;
    const message =
      err?.response?.data?.error ?? 'Failed to remove signer wallet';
    return NextResponse.json({ error: message }, { status });
  }
}
