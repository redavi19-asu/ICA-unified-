import { NextResponse } from 'next/server';
import { requireSession } from '../../../../lib/auth';
import {
  createOrganizationPaymentOnboarding,
  refreshOrganizationPaymentAccount,
  stripeConnectConfigured,
} from '../../../../lib/member-payments';

export async function POST(request: Request) {
  const { membership } = await requireSession();
  if (!['OWNER', 'ADMIN'].includes(membership.role)) {
    return NextResponse.json({ error: 'Only an owner or admin can manage organization payments.' }, { status: 403 });
  }

  const origin = new URL(request.url).origin;
  const form = await request.formData().catch(() => null);
  const action = String(form?.get('action') || 'ONBOARD').toUpperCase();

  if (!stripeConnectConfigured()) {
    return NextResponse.redirect(`${origin}/workspace/billing?connect=unavailable`, 303);
  }

  try {
    if (action === 'REFRESH') {
      await refreshOrganizationPaymentAccount(membership.organizationId);
      return NextResponse.redirect(`${origin}/workspace/billing?connect=return`, 303);
    }

    const onboarding = await createOrganizationPaymentOnboarding({
      organizationId: membership.organizationId,
      organizationEmail: membership.user.email,
      origin,
    });
    return NextResponse.redirect(onboarding.url, 303);
  } catch (error) {
    console.error('ICA_STRIPE_CONNECT_ONBOARDING_ERROR', error);
    return NextResponse.redirect(`${origin}/workspace/billing?connect=error`, 303);
  }
}
