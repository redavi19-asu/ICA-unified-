import { NextResponse } from 'next/server';
import { requireSession } from '../../../../lib/auth';
import { createProfessionalCheckout, isStripeCheckoutConfigured } from '../../../../lib/stripe-billing';

export async function POST(request: Request) {
  const { membership } = await requireSession();

  if (!['OWNER', 'ADMIN'].includes(membership.role)) {
    return NextResponse.json({ error: 'Only an organization owner or admin can start billing.' }, { status: 403 });
  }

  if (!isStripeCheckoutConfigured()) {
    return NextResponse.json(
      { error: 'Stripe is not connected to ICA Unified yet.', code: 'STRIPE_SETUP_REQUIRED' },
      { status: 503 },
    );
  }

  try {
    const session = await createProfessionalCheckout({
      organizationId: membership.organizationId,
      organizationName: membership.organization.name,
      ownerEmail: membership.user.email,
      origin: new URL(request.url).origin,
    });

    return NextResponse.json({ ok: true, checkoutUrl: session.url });
  } catch (error) {
    console.error('ICA_STRIPE_CHECKOUT_ERROR', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to open Stripe Checkout.' },
      { status: 500 },
    );
  }
}
