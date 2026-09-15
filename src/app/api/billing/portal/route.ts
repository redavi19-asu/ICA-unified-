import { NextResponse } from 'next/server';
import { requireSession } from '../../../../lib/auth';
import { ensureBillingProfile } from '../../../../lib/organization-ops';

export async function POST(request: Request) {
  const { membership } = await requireSession();
  if (!['OWNER', 'ADMIN'].includes(membership.role)) {
    return NextResponse.json({ error: 'Only an owner or admin can manage billing.' }, { status: 403 });
  }

  const secret = (process.env.STRIPE_SECRET_KEY || '').trim();
  if (!secret) return NextResponse.json({ error: 'Stripe is not configured.' }, { status: 503 });

  const profile = await ensureBillingProfile(membership.organizationId);
  if (!profile?.providerCustomerId) {
    return NextResponse.json({ error: 'No Stripe customer is connected to this organization yet.' }, { status: 409 });
  }

  const origin = new URL(request.url).origin;
  const body = new URLSearchParams();
  body.set('customer', profile.providerCustomerId);
  body.set('return_url', `${origin}/workspace/billing`);

  const stripeResponse = await fetch('https://api.stripe.com/v1/billing_portal/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secret}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });

  const data = await stripeResponse.json() as { url?: string; error?: { message?: string } };
  if (!stripeResponse.ok || !data.url) {
    return NextResponse.json({ error: data.error?.message || 'Unable to open Stripe billing portal.' }, { status: 502 });
  }

  return NextResponse.redirect(data.url, 303);
}
