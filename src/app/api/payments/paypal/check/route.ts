import { NextResponse } from 'next/server';
import { requireSession } from '../../../../../lib/auth';
import { paypalPartnerConfig, refreshPayPalMerchantStatus } from '../../../../../lib/paypal-connect';

export async function POST(request: Request) {
  const { membership } = await requireSession();
  if (!['OWNER', 'ADMIN'].includes(membership.role)) {
    return NextResponse.json({ error: 'Only a business owner or admin can check payments.' }, { status: 403 });
  }
  const origin = new URL(request.url).origin;
  const submittedOrigin = request.headers.get('origin');
  if (submittedOrigin && submittedOrigin !== origin) {
    return NextResponse.json({ error: 'Invalid connection check.' }, { status: 403 });
  }
  const cfg = paypalPartnerConfig();
  if (!cfg.configured) {
    return NextResponse.redirect(origin + '/workspace/payments?paypal=unavailable', 303);
  }
  try {
    const status = await refreshPayPalMerchantStatus(membership.organizationId);
    const outcome = status.connectionStatus === 'CONNECTED' ? 'check-ok' : 'action-required';
    return NextResponse.redirect(origin + '/workspace/payments?paypal=' + outcome, 303);
  } catch {
    console.warn('ICA_PAYPAL_MERCHANT_HEALTH_CHECK_FAILED');
    return NextResponse.redirect(origin + '/workspace/payments?paypal=reconnect', 303);
  }
}
