import { NextResponse } from 'next/server';
import { requireSession } from '../../../../../lib/auth';
import {
  authorizeNetPartnerConfig, finishAuthorizeNetMerchantOnboarding,
} from '../../../../../lib/authorize-net-connect';

export async function GET(request: Request) {
  const { membership } = await requireSession();
  if (!['OWNER', 'ADMIN'].includes(membership.role)) {
    return NextResponse.json({ error: 'Business owner or admin required.' }, { status: 403 });
  }
  const cfg = authorizeNetPartnerConfig();
  if (!cfg.ready) return NextResponse.json({ error: 'Merchant connection unavailable.' }, { status: 503 });
  const callback = new URL(request.url);
  const target = new URL('/workspace/payments', cfg.callbackUrl);
  if (callback.searchParams.get('error')) {
    target.searchParams.set('authnet', 'cancelled');
    return NextResponse.redirect(target, 303);
  }
  try {
    await finishAuthorizeNetMerchantOnboarding({
      organizationId: membership.organizationId, userId: membership.userId,
      state: callback.searchParams.get('state') || '',
      code: callback.searchParams.get('code') || '',
    });
    target.searchParams.set('authnet', 'connected');
  } catch {
    console.warn('ICA_AUTHNET_MERCHANT_CALLBACK_FAILED');
    target.searchParams.set('authnet', 'error');
  }
  return NextResponse.redirect(target, 303);
}
