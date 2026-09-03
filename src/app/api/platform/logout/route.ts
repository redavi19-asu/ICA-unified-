import { NextResponse } from 'next/server';
import { platformSessionCookie } from '../../../../lib/platform-auth';

export async function POST(request: Request) {
  const response = NextResponse.redirect(new URL('/platform/login', request.url), { status: 303 });
  response.cookies.set(platformSessionCookie.name, '', { ...platformSessionCookie.options, maxAge: 0 });
  return response;
}
