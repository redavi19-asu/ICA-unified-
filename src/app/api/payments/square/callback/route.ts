import { NextResponse } from 'next/server';
import { requireSession } from '../../../../../lib/auth';
import { finishSquareOnboarding, squareConfig } from '../../../../../lib/square-connect';

export async function GET(request: Request) {
  const { membership } = await requireSession();
  if (!['OWNER', 'ADMIN'].includes(membership.role)) {
    return NextResponse.json({ error: 'You cannot connect payment accounts for this business.' }, { status: 403 });
  }
  const config = squareConfig();
  if (!config.ready) return NextResponse.json({ error: 'Square connection unavailable.' }, { status: 503 });

  const url = new URL(request.url);
  if (url.searchParams.get('error')) {
    return NextResponse.redirect(new URL('/workspace/payments?square=cancelled', config.redirectUri), 303);
  }

  try {
    const result = await finishSquareOnboarding({
      organizationId: membership.organizationId,
      userId: membership.userId,
      state: url.searchParams.get('state') || '',
      code: url.searchParams.get('code') || '',
    });
    const target = result.status === 'CONNECTED' ? 'connected' : 'needs-location';
    return NextResponse.redirect(new URL('/workspace/payments?square=' + target, config.redirectUri), 303);
  } catch (error) {
    console.error('ICA_SQUARE_CALLBACK_ERROR', error instanceof Error ? error.message : 'Square callback failed');
    return NextResponse.redirect(new URL('/workspace/payments?square=error', config.redirectUri), 303);
  }
}
