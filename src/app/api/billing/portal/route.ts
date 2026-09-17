import { NextResponse } from 'next/server';
import { requireSession } from '../../../../lib/auth';
import { ensureBillingProfile } from '../../../../lib/organization-ops';

type PortalConfiguration = {
  id: string;
  active?: boolean;
  features?: {
    subscription_cancel?: {
      enabled?: boolean;
      mode?: string;
    };
  };
};

async function ensurePortalConfiguration(secret: string) {
  const configuredId = (process.env.STRIPE_BILLING_PORTAL_CONFIGURATION_ID || '').trim();
  if (configuredId) return configuredId;

  const headers = { Authorization: `Bearer ${secret}` };
  const listResponse = await fetch('https://api.stripe.com/v1/billing_portal/configurations?active=true&limit=100', { headers });
  if (listResponse.ok) {
    const list = await listResponse.json() as { data?: PortalConfiguration[] };
    const usable = (list.data || []).find((item) =>
      item.active !== false &&
      item.features?.subscription_cancel?.enabled === true &&
      item.features?.subscription_cancel?.mode === 'at_period_end'
    );
    if (usable?.id) return usable.id;
  }

  const body = new URLSearchParams();
  body.set('business_profile[headline]', 'Manage your ICA Unified subscription');
  body.set('features[invoice_history][enabled]', 'true');
  body.set('features[payment_method_update][enabled]', 'true');
  body.set('features[subscription_cancel][enabled]', 'true');
  body.set('features[subscription_cancel][mode]', 'at_period_end');

  const createResponse = await fetch('https://api.stripe.com/v1/billing_portal/configurations', {
    method: 'POST',
    headers: {
      ...headers,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });

  const created = await createResponse.json() as PortalConfiguration & { error?: { message?: string } };
  if (!createResponse.ok || !created.id) {
    throw new Error(created.error?.message || 'Unable to configure Stripe customer cancellation.');
  }
  return created.id;
}

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

  try {
    const configurationId = await ensurePortalConfiguration(secret);
    const origin = new URL(request.url).origin;
    const body = new URLSearchParams();
    body.set('customer', profile.providerCustomerId);
    body.set('return_url', `${origin}/workspace/billing`);
    body.set('configuration', configurationId);

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
  } catch (error) {
    console.error('ICA_STRIPE_PORTAL_ERROR', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to open Stripe billing portal.' },
      { status: 502 },
    );
  }
}
