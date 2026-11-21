import { NextResponse } from 'next/server';
import { requireSession } from '../../../../../lib/auth';
import { selectSquareMerchantLocation, squareConfig } from '../../../../../lib/square-connect';

export async function POST(request: Request) {
  const { membership } = await requireSession();
  if (!['OWNER', 'ADMIN'].includes(membership.role)) {
    return NextResponse.json({ error: 'Only a business owner or admin may select a Square location.' }, { status: 403 });
  }
  const origin = new URL(request.url).origin;
  const submittedOrigin = request.headers.get('origin');
  if (submittedOrigin && submittedOrigin !== origin) {
    return NextResponse.json({ error: 'Invalid payment configuration request.' }, { status: 403 });
  }
  const cfg = squareConfig();
  if (!cfg.ready) return NextResponse.json({ error: 'Square is not configured.' }, { status: 503 });

  try {
    const data = await request.formData();
    await selectSquareMerchantLocation(membership.organizationId, String(data.get('locationId') || ''));
    return NextResponse.redirect(new URL('/workspace/payments?square=location-selected', cfg.redirectUri), 303);
  } catch (error) {
    console.error('ICA_SQUARE_LOCATION_ERROR', error instanceof Error ? error.message : 'Square location failed');
    return NextResponse.redirect(new URL('/workspace/payments?square=location-error', cfg.redirectUri), 303);
  }
}
