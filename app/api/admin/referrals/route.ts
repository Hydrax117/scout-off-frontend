import { NextRequest, NextResponse } from 'next/server';
import api from '@/lib/api';

const ADMIN_ADDRESS = process.env.NEXT_PUBLIC_ADMIN_ADDRESS;

export async function GET(req: NextRequest) {
  const sessionCookie = req.cookies.get('session')?.value;
  if (!sessionCookie || sessionCookie !== ADMIN_ADDRESS) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const overview = await api.get('/referrals/overview').then((r) => r.data);
  return NextResponse.json(overview);
}
