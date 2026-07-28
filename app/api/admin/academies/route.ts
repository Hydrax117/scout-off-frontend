import { NextRequest, NextResponse } from 'next/server';
import api from '@/lib/api';

const ADMIN_ADDRESS = process.env.NEXT_PUBLIC_ADMIN_ADDRESS;

function requireAdminWallet(req: NextRequest): string | null {
  const sessionCookie = req.cookies.get('session')?.value;
  if (!sessionCookie || sessionCookie !== ADMIN_ADDRESS) return null;
  return sessionCookie;
}

export async function GET(req: NextRequest) {
  const admin = requireAdminWallet(req);
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const academies = await api.get('/academies').then((r) => r.data);
  return NextResponse.json(academies);
}

export async function POST(req: NextRequest) {
  const admin = requireAdminWallet(req);
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { name, ownerWallet } = await req.json().catch(() => ({}));
  if (
    typeof name !== 'string' ||
    !name.trim() ||
    typeof ownerWallet !== 'string' ||
    !ownerWallet.trim()
  ) {
    return NextResponse.json(
      { error: 'name and ownerWallet are required' },
      { status: 400 },
    );
  }

  try {
    const academy = await api
      .post('/academies', { name, ownerWallet, createdBy: admin })
      .then((r) => r.data);
    return NextResponse.json(academy, { status: 201 });
  } catch (err: any) {
    const status = err?.response?.status ?? 502;
    const message = err?.response?.data?.error ?? 'Failed to create academy';
    return NextResponse.json({ error: message }, { status });
  }
}
