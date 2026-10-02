import { NextResponse } from 'next/server';
import { readSession, sessionCookie } from '../../../../lib/auth';
import { revokeSession } from '../../../../lib/security';

function clearSessionCookie(response: NextResponse) {
  response.cookies.set(sessionCookie.name, '', {
    ...sessionCookie.options,
    maxAge: 0,
    expires: new Date(0),
  });
  return response;
}

export async function POST() {
  const session = await readSession();
  if (session) {
    await revokeSession({
      sessionId: session.sessionId,
      scope: 'user',
      principalId: session.userId,
      expiresAtSeconds: session.expiresAtSeconds,
    });
  }

  return clearSessionCookie(
    NextResponse.json(
      { ok: true },
      {
        status: 200,
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, private',
          Pragma: 'no-cache',
          Expires: '0',
        },
      },
    ),
  );
}
