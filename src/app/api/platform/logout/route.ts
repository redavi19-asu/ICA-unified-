import { NextResponse } from 'next/server';
import { platformSessionCookie } from '../../../../lib/platform-auth';

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(platformSessionCookie.name, '', { ...platformSessionCookie.options, maxAge: 0 });
  return response;
}
