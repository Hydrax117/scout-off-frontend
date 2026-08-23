import { NextRequest, NextResponse } from 'next/server';
import api from '@/lib/api';
import { requireAdminWallet } from '@/lib/adminAuth';

export async function GET(req: NextRequest) {
  const admin = requireAdminWallet(req);
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const overview = await api.get('/referrals/overview').then((r) => r.data);
  return NextResponse.json(overview);
}
