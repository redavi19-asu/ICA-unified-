import { createHmac } from 'crypto';
import { prisma } from './prisma';
import { ensureBillingProfile, PROFESSIONAL_PLAN } from './organization-ops';

type StripeCheckoutSession = {
  id: string;
  client_reference_id?: string | null;
  customer?: string | { id?: string } | null;
  subscription?: string | { id?: string } | null;
  metadata?: Record<string, string>;
  status?: string;
};

type StripeSubscription = {
  id: string;
  customer?: string | { id?: string } | null;
  status: string;
  trial_end?: number | null;
  metadata?: Record<string, string>;
};

function stripeSecret() {
  return (process.env.STRIPE_SECRET_KEY || '').trim();
}

function stripePriceId() {
  return (process.env.STRIPE_PROFESSIONAL_PRICE_ID || '').trim();
}

export function isStripeCheckoutConfigured() {
  return Boolean(stripeSecret() && stripePriceId());
}

export function isStripeEntitledStatus(status: string) {
  return ['trialing', 'active'].includes(String(status || '').toLowerCase());
}

function objectId(value: unknown) {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && 'id' in value && typeof (value as { id?: unknown }).id === 'string') {
    return (value as { id: string }).id;
  }
  return null;
}

async function stripeRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const secret = stripeSecret();
  if (!secret) throw new Error('STRIPE_NOT_CONFIGURED');

  const response = await fetch(`https://api.stripe.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${secret}`,
      ...(init?.body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
      ...(init?.headers || {}),
    },
  });

  const data = await response.json() as T & { error?: { message?: string } };
  if (!response.ok) {
    throw new Error(data?.error?.message || `Stripe request failed with HTTP ${response.status}.`);
  }
  return data;
}

export async function createProfessionalCheckout(input: {
  organizationId: string;
  organizationName: string;
  ownerEmail: string;
  origin: string;
}) {
  const priceId = stripePriceId();
  if (!isStripeCheckoutConfigured()) throw new Error('STRIPE_NOT_CONFIGURED');

  const billing = await ensureBillingProfile(input.organizationId);
  const currentStatus = String(billing?.subscriptionStatus || '').toLowerCase();
  const terminalStatuses = new Set(['', 'not_connected', 'canceled', 'incomplete_expired']);
  if (billing?.providerSubscriptionId && !terminalStatuses.has(currentStatus)) {
    throw new Error('SUBSCRIPTION_ALREADY_EXISTS');
  }
  if (isStripeEntitledStatus(currentStatus)) {
    throw new Error('SUBSCRIPTION_ALREADY_EXISTS');
  }

  const params = new URLSearchParams();
  params.set('mode', 'subscription');
  params.set('line_items[0][price]', priceId);
  params.set('line_items[0][quantity]', '1');
  params.set('payment_method_collection', 'always');
  params.set('client_reference_id', input.organizationId);
  params.set('metadata[organizationId]', input.organizationId);
  params.set('metadata[organizationName]', input.organizationName);
  params.set('subscription_data[metadata][organizationId]', input.organizationId);
  params.set('subscription_data[metadata][plan]', PROFESSIONAL_PLAN);
  params.set('subscription_data[trial_end]', String(Math.floor(Date.now() / 1000) + (14 * 24 * 60 * 60)));
  params.set('success_url', `${input.origin}/setup/complete?session_id={CHECKOUT_SESSION_ID}`);
  params.set('cancel_url', `${input.origin}/setup/billing?cancelled=1`);

  if (billing?.providerCustomerId) params.set('customer', billing.providerCustomerId);
  else params.set('customer_email', input.ownerEmail);

  const session = await stripeRequest<StripeCheckoutSession>('/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      'Idempotency-Key': `ica-professional-checkout-${input.organizationId}`,
    },
    body: params,
  });

  if (!session.id || !(session as StripeCheckoutSession & { url?: string }).url) {
    throw new Error('Stripe did not return a Checkout URL.');
  }

  return session as StripeCheckoutSession & { url: string };
}

async function getSubscription(subscriptionId: string) {
  return stripeRequest<StripeSubscription>(`/v1/subscriptions/${encodeURIComponent(subscriptionId)}`);
}

function organizationStatusForStripe(status: string) {
  switch (String(status || '').toLowerCase()) {
    case 'trialing': return 'TRIAL';
    case 'active': return 'ACTIVE';
    case 'canceled':
    case 'incomplete_expired': return 'CANCELLED';
    default: return 'SUSPENDED';
  }
}

export async function applyStripeSubscription(
  organizationId: string,
  subscription: StripeSubscription,
  customerId?: string | null,
) {
  await ensureBillingProfile(organizationId);

  const resolvedCustomer = customerId || objectId(subscription.customer);
  await prisma.$executeRawUnsafe(
    `UPDATE OrganizationBillingProfile
     SET plan = ?,
         subscriptionStatus = ?,
         provider = 'STRIPE',
         providerCustomerId = COALESCE(?, providerCustomerId),
         providerSubscriptionId = ?,
         updatedAt = CURRENT_TIMESTAMP
     WHERE organizationId = ?`,
    PROFESSIONAL_PLAN,
    subscription.status,
    resolvedCustomer,
    subscription.id,
    organizationId,
  );

  const trialEndsAt = subscription.trial_end ? new Date(subscription.trial_end * 1000) : null;
  await prisma.organization.update({
    where: { id: organizationId },
    data: {
      plan: PROFESSIONAL_PLAN,
      status: organizationStatusForStripe(subscription.status),
      ...(trialEndsAt ? { trialEndsAt } : {}),
    },
  });

  return subscription.status;
}

export async function confirmCheckoutForOrganization(organizationId: string, sessionId: string) {
  const session = await stripeRequest<StripeCheckoutSession>(
    `/v1/checkout/sessions/${encodeURIComponent(sessionId)}?expand[]=subscription`,
  );

  const referencedOrganization = session.client_reference_id || session.metadata?.organizationId;
  if (referencedOrganization !== organizationId) {
    throw new Error('Checkout session does not belong to this organization.');
  }

  const subscriptionId = objectId(session.subscription);
  if (!subscriptionId) throw new Error('Stripe Checkout did not create a subscription.');

  const subscription = await getSubscription(subscriptionId);
  const customerId = objectId(session.customer);
  await applyStripeSubscription(organizationId, subscription, customerId);

  return { session, subscription };
}

export async function resolveOrganizationForSubscription(subscription: StripeSubscription) {
  const fromMetadata = subscription.metadata?.organizationId;
  if (fromMetadata) return fromMetadata;

  await ensureBillingProfile('__bootstrap__');
  await prisma.$executeRawUnsafe(
    `DELETE FROM OrganizationBillingProfile WHERE organizationId = '__bootstrap__'`,
  );

  const rows = await prisma.$queryRawUnsafe<Array<{ organizationId: string }>>(
    `SELECT organizationId
     FROM OrganizationBillingProfile
     WHERE providerSubscriptionId = ?
     LIMIT 1`,
    subscription.id,
  );
  return rows[0]?.organizationId || null;
}

function constantTimeHexEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let index = 0; index < a.length; index += 1) {
    mismatch |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return mismatch === 0;
}

export function verifyStripeWebhookSignature(rawBody: string, signatureHeader: string) {
  const secret = (process.env.STRIPE_WEBHOOK_SECRET || '').trim();
  if (!secret) throw new Error('STRIPE_WEBHOOK_NOT_CONFIGURED');

  const parts = signatureHeader.split(',').map((part) => part.trim());
  const timestamp = parts.find((part) => part.startsWith('t='))?.slice(2);
  const signatures = parts.filter((part) => part.startsWith('v1=')).map((part) => part.slice(3));
  if (!timestamp || signatures.length === 0) return false;

  const unix = Number(timestamp);
  if (!Number.isFinite(unix) || Math.abs(Math.floor(Date.now() / 1000) - unix) > 300) return false;

  const expected = createHmac('sha256', secret)
    .update(`${timestamp}.${rawBody}`)
    .digest('hex');

  return signatures.some((signature) => constantTimeHexEqual(expected, signature));
}

export async function handleStripeSnapshotEvent(event: {
  type?: string;
  data?: { object?: unknown };
}) {
  const type = String(event.type || '');
  const object = event.data?.object as Record<string, unknown> | undefined;
  if (!object) return;

  if (type === 'checkout.session.completed') {
    const organizationId = String(
      object.client_reference_id ||
      (object.metadata && typeof object.metadata === 'object' && 'organizationId' in object.metadata
        ? (object.metadata as Record<string, unknown>).organizationId
        : '') ||
      '',
    );
    const sessionId = String(object.id || '');
    if (organizationId && sessionId) await confirmCheckoutForOrganization(organizationId, sessionId);
    return;
  }

  if (type.startsWith('customer.subscription.')) {
    const subscription = object as unknown as StripeSubscription;
    const organizationId = await resolveOrganizationForSubscription(subscription);
    if (organizationId) await applyStripeSubscription(organizationId, subscription);
  }
}