import { NextResponse } from 'next/server';
import { verifySessionToken } from '../../../../../lib/auth';
import { revokeSession } from '../../../../../lib/security';

export async function POST(request: Request) {
  const header = request.headers.get('authorization') || '';
  if (!header.toLowerCase().startsWith('bearer ')) {
    return NextResponse.json({ ok: true });
  }

  const token = header.slice(7).trim();
  const session = await verifySessionToken(token);
  if (session) {
    await revokeSession({
      sessionId: session.sessionId,
      scope: 'user',
      principalId: session.userId,
      expiresAtSeconds: session.expiresAtSeconds,
    });
  }

  return NextResponse.json(
    { ok: true },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
