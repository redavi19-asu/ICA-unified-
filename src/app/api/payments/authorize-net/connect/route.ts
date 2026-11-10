import { NextResponse } from 'next/server';
import { requireSession } from '../../../../../lib/auth';
import {
  beginAuthorizeNetMerchantOnboarding, authorizeNetPartnerConfig,
} from '../../../../../lib/authorize-net-connect';

export async function POST(request: Request) {
  const { membership } = await requireSession();
  if (!['OWNER', 'ADMIN'].includes(membership.role)) {
    return NextResponse.json({ error: 'Business owner or admin required.' }, { status: 403 });
  }
  const origin = new URL(request.url).origin;
  if (request.headers.get('origin') && request.headers.get('origin') !== origin) {
    return NextResponse.json({ error: 'Invalid merchant connection request.' }, { status: 403 });
  }
  if (!authorizeNetPartnerConfig().ready) {
    return NextResponse.json({ error: 'Authorize.net merchant connection is not yet configured.' }, { status: 503 });
  }
  try {
    const consentUrl = await beginAuthorizeNetMerchantOnboarding(membership.organizationId, membership.userId);
    return NextResponse.redirect(consentUrl, 303);
  } catch {
    console.warn('ICA_AUTHNET_MERCHANT_ONBOARDING_FAILED');
    return NextResponse.redirect(origin + '/workspace/payments?authnet=error', 303);
  }
}
