import { NextResponse } from 'next/server';
import { consumeSecurityToken, markUserEmailVerified } from '../../../../lib/security';

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get('token') || '';
  if (!token) return NextResponse.redirect(new URL('/login?verified=failed', request.url));

  const userId = await consumeSecurityToken(token, 'EMAIL_VERIFY');
  if (!userId) return NextResponse.redirect(new URL('/login?verified=failed', request.url));

  await markUserEmailVerified(userId);
  return NextResponse.redirect(new URL('/setup/billing?verified=1', request.url));
}
