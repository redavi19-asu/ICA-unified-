import { NextResponse } from 'next/server';
import { sessionCookie } from '../../../../lib/auth';

function clearSessionCookie(response: NextResponse) {
  response.cookies.set(sessionCookie.name, '', {
    ...sessionCookie.options,
    maxAge: 0,
    expires: new Date(0),
  });
  return response;
}

export async function POST() {
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
