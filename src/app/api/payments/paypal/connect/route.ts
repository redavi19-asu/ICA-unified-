import { NextResponse } from 'next/server';
import { requireSession } from '../../../../../lib/auth';
import { paypalPartnerConfig, startPayPalMerchantOnboarding } from '../../../../../lib/paypal-connect';

export async function POST(request: Request) {
  const { membership } = await requireSession();
  if (!['OWNER', 'ADMIN'].includes(membership.role)) {
    return NextResponse.json({ error: 'Only business owners and admins can connect payments.' }, { status: 403 });
  }
  const origin = new URL(request.url).origin;
  const headerOrigin = request.headers.get('origin');
  if (headerOrigin && headerOrigin !== origin) {
    return NextResponse.json({ error: 'Invalid connection request.' }, { status: 403 });
  }
  const config = paypalPartnerConfig();
  if (!config.configured) {
    return NextResponse.json({
      error: 'PayPal business connection is not available yet. No changes are needed on your account.',
    }, { status: 503 });
  }
  try {
    const actionUrl = await startPayPalMerchantOnboarding(membership.organizationId, membership.userId);
    return NextResponse.redirect(actionUrl, 303);
  } catch {
    console.error('ICA_PAYPAL_MERCHANT_ONBOARD_ERROR');
    return NextResponse.redirect(new URL('/workspace/payments?paypal=error', origin), 303);
  }
}
