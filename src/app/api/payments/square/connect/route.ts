import { NextResponse } from 'next/server';
import { requireSession } from '../../../../../lib/auth';
import { beginSquareOnboarding, squareConfig } from '../../../../../lib/square-connect';

export async function POST(request: Request) {
  const { membership } = await requireSession();
  if (!['OWNER', 'ADMIN'].includes(membership.role)) {
    return NextResponse.json({ error: 'Only an organization owner or admin can connect business payments.' }, { status: 403 });
  }

  const origin = new URL(request.url).origin;
  const submittedOrigin = request.headers.get('origin');
  if (submittedOrigin && submittedOrigin !== origin) {
    return NextResponse.json({ error: 'Invalid connection request origin.' }, { status: 403 });
  }

  const cfg = squareConfig();
  if (!cfg.ready) {
    return NextResponse.json({ error: 'Square connection is not available yet.' }, { status: 503 });
  }

  try {
    const url = await beginSquareOnboarding(membership.organizationId, membership.userId);
    return NextResponse.redirect(url, 303);
  } catch (error) {
    console.error('ICA_SQUARE_CONNECT_ERROR', error instanceof Error ? error.message : 'Unknown connection error');
    return NextResponse.redirect(new URL('/workspace/payments?square=error', cfg.redirectUri), 303);
  }
}
