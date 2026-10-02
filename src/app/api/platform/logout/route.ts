import { NextResponse } from 'next/server';
import { platformSessionCookie, readPlatformSession } from '../../../../lib/platform-auth';
import { revokeSession } from '../../../../lib/security';

export async function POST(request: Request) {
  const session = await readPlatformSession();
  if (session) {
    await revokeSession({
      sessionId: session.sessionId,
      scope: 'platform',
      principalId: session.platformAdminId,
      expiresAtSeconds: session.expiresAtSeconds,
    });
  }

  const response = NextResponse.redirect(new URL('/platform/login', request.url), { status: 303 });
  response.cookies.set(platformSessionCookie.name, '', {
    ...platformSessionCookie.options,
    maxAge: 0,
    expires: new Date(0),
  });
  return response;
}
