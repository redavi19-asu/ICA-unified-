import { NextResponse } from 'next/server';
import { requireSession } from '../../../../lib/auth';
import { setPreferredBusinessCheckoutProvider } from '../../../../lib/business-payment-preferences';

export async function POST(request: Request) {
  const { membership } = await requireSession();
  if (!['OWNER', 'ADMIN'].includes(membership.role)) {
    return NextResponse.json({ error: 'Only a business owner or admin may select a payment processor.' }, { status: 403 });
  }
  const origin = new URL(request.url).origin;
  if (request.headers.get('origin') && request.headers.get('origin') !== origin) {
    return NextResponse.json({ error: 'Invalid payment configuration origin.' }, { status: 403 });
  }
  const form = await request.formData().catch(() => null);
  const choice = String(form?.get('provider') || '');
  if (choice !== 'STRIPE' && choice !== 'SQUARE' && choice !== 'PAYPAL') {
    return NextResponse.json({ error: 'Unsupported payment provider.' }, { status: 400 });
  }
  try {
    await setPreferredBusinessCheckoutProvider(membership.organizationId, choice);
    return NextResponse.redirect(origin + '/workspace/payments?selected=1', 303);
  } catch (error) {
    console.error('ICA_BUSINESS_PROVIDER_SELECTION_ERROR', error instanceof Error ? error.message : 'Unknown error');
    return NextResponse.redirect(origin + '/workspace/payments?selected=unavailable', 303);
  }
}
