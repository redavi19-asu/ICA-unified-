import { NextResponse } from 'next/server';
import { requireSession } from '../../../../../lib/auth';
import { confirmPayPalMerchantOnboarding, paypalPartnerConfig } from '../../../../../lib/paypal-connect';

export async function GET(request: Request) {
  const { membership } = await requireSession();
  if (!['OWNER', 'ADMIN'].includes(membership.role)) {
    return NextResponse.json({ error: 'Only a business owner or admin can connect payments.' }, { status: 403 });
  }
  const cfg = paypalPartnerConfig();
  if (!cfg.configured) return NextResponse.json({ error: 'PayPal connection is not configured.' }, { status: 503 });
  const url = new URL(request.url);
  const redirect = new URL('/workspace/payments', cfg.callbackUrl);
  const trackingId = url.searchParams.get('merchantId') || '';
  const returnedMerchantId = url.searchParams.get('merchantIdInPayPal') || '';
  if (url.searchParams.get('permissionsGranted') !== 'true' ||
      url.searchParams.get('consentStatus') !== 'true' ||
      !trackingId || !returnedMerchantId) {
    redirect.searchParams.set('paypal', 'cancelled');
    return NextResponse.redirect(redirect, 303);
  }
  try {
    const result = await confirmPayPalMerchantOnboarding({
      organizationId: membership.organizationId,
      userId: membership.userId,
      trackingId,
      returnedMerchantId,
    });
    redirect.searchParams.set('paypal', result.connected ? 'connected' : 'action-required');
    return NextResponse.redirect(redirect, 303);
  } catch {
    console.error('ICA_PAYPAL_MERCHANT_CALLBACK_ERROR');
    redirect.searchParams.set('paypal', 'error');
    return NextResponse.redirect(redirect, 303);
  }
}
