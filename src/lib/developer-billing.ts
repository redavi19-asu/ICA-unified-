import { prisma } from './prisma';

export const DEVELOPER_PLANS = {
  starter: { priceCents: 2900, monthlyCalls: 25000 },
  pro: { priceCents: 9900, monthlyCalls: 150000 },
} as const;
export type DeveloperPlan = keyof typeof DEVELOPER_PLANS;

type SubscriptionRow = {
  organizationId: string;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  plan: string | null;
  status: string;
  periodStart: number;
  periodEnd: number;
};
type StripeSubscription = {
  id: string;
  customer: string | { id: string };
  status: string;
  metadata?: Record<string, string>;
  items: { data: Array<{ quantity?: number; current_period_start: number; current_period_end: number;
    price: { id: string; currency: string; unit_amount: number | null; recurring?: { interval: string; interval_count: number } } }> };
};

const active = new Set(['active', 'trialing']);
const secret = () => (process.env.STRIPE_SECRET_KEY || '').trim();
const priceId = (plan: DeveloperPlan) =>
  (plan === 'starter' ? process.env.STRIPE_DEVELOPER_STARTER_PRICE_ID : process.env.STRIPE_DEVELOPER_PRO_PRICE_ID) || '';
export function developerBillingReady() {
  return process.env.ICA_DEVELOPER_BILLING_ENABLED === 'true' &&
    Number.isFinite(Date.parse(process.env.ICA_DEVELOPER_BILLING_ENFORCE_FROM || '')) && Boolean(
    secret() && process.env.STRIPE_WEBHOOK_SECRET && priceId('starter') && priceId('pro')
  );
}

let tablesReady: Promise<void> | null = null;
export async function ensureDeveloperBillingTables() {
  if (!tablesReady) {
    tablesReady = (async () => {
      await prisma.$executeRawUnsafe(
        "CREATE TABLE IF NOT EXISTS ICADeveloperSubscription (organizationId TEXT PRIMARY KEY NOT NULL, stripeCustomerId TEXT UNIQUE, stripeSubscriptionId TEXT UNIQUE, plan TEXT, status TEXT NOT NULL DEFAULT 'pending', periodStart INTEGER NOT NULL DEFAULT 0, periodEnd INTEGER NOT NULL DEFAULT 0, updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"
      );
      await prisma.$executeRawUnsafe(
        "CREATE TABLE IF NOT EXISTS ICADeveloperUsage (organizationId TEXT NOT NULL, periodStart INTEGER NOT NULL, used INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(organizationId,periodStart))"
      );
    })().catch(error => { tablesReady = null; throw error; });
  }
  await tablesReady;
}

async function rowFor(organizationId: string): Promise<SubscriptionRow | undefined> {
  const rows = await prisma.$queryRawUnsafe<SubscriptionRow[]>(
    'SELECT * FROM ICADeveloperSubscription WHERE organizationId=? LIMIT 1', organizationId
  );
  return rows[0];
}

async function requestStripe<T>(path: string, options?: { method?: string; body?: URLSearchParams; idempotency?: string }): Promise<T> {
  if (!secret()) throw new Error('STRIPE_NOT_CONFIGURED');
  const response = await fetch('https://api.stripe.com/v1/' + path, {
    method: options?.method || 'GET',
    headers: {
      Authorization: 'Bearer ' + secret(),
      ...(options?.body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
      ...(options?.idempotency ? { 'Idempotency-Key': options.idempotency } : {}),
    },
    body: options?.body,
  });
  const data = await response.json() as T & { error?: { message?: string } };
  if (!response.ok) throw new Error(data.error?.message || 'Developer billing request failed');
  return data;
}

export async function developerBillingStatus(organizationId: string) {
  await ensureDeveloperBillingTables();
  const row = await rowFor(organizationId);
  const now = Math.floor(Date.now() / 1000);
  const entitled = Boolean(row && active.has(row.status) && row.periodEnd > now);
  const usage = row?.periodStart ? await prisma.$queryRawUnsafe<Array<{ used: number }>>(
    'SELECT used FROM ICADeveloperUsage WHERE organizationId=? AND periodStart=?',
    organizationId, row.periodStart
  ) : [];
  return {
    enabled: developerBillingReady(),
    plans: DEVELOPER_PLANS,
    subscription: row ? {
      plan: row.plan, status: row.status, active: entitled, periodEnd: row.periodEnd,
    } : null,
    usage: {
      used: Number(usage[0]?.used || 0),
      included: entitled && row?.plan && row.plan in DEVELOPER_PLANS ?
        DEVELOPER_PLANS[row.plan as DeveloperPlan].monthlyCalls : null,
    },
  };
}

function companyOrigin() {
  const raw = process.env.SOCIAL_AUTH_ORIGIN || 'https://unified.icomputeranything.com';
  const parsed = new URL(raw);
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash)
    throw new Error('Developer billing origin not configured');
  return parsed.origin;
}

export async function createDeveloperCheckout(organizationId: string, email: string, plan: DeveloperPlan) {
  if (!developerBillingReady()) throw new Error('DEVELOPER_BILLING_NOT_ACTIVE');
  await ensureDeveloperBillingTables();
  const old = await rowFor(organizationId);
  if (old && ['active', 'trialing', 'past_due', 'unpaid', 'incomplete', 'paused'].includes(old.status))
    throw new Error('DEVELOPER_SUBSCRIPTION_EXISTS');
  const id = priceId(plan);
  const price = await requestStripe<{ active: boolean; currency: string; unit_amount: number; recurring?: { interval: string; interval_count: number } }>(
    'prices/' + encodeURIComponent(id)
  );
  if (!price.active || price.currency !== 'usd' || price.unit_amount !== DEVELOPER_PLANS[plan].priceCents ||
      price.recurring?.interval !== 'month' || price.recurring.interval_count !== 1)
    throw new Error('DEVELOPER_PRICE_MISMATCH');

  let customer = old?.stripeCustomerId;
  if (!customer) {
    const data = new URLSearchParams();
    data.set('email', email);
    data.set('metadata[ica_developer_organization_id]', organizationId);
    const created = await requestStripe<{ id: string }>('customers', {
      method: 'POST', body: data, idempotency: 'ica-dev-customer-' + organizationId,
    });
    await prisma.$executeRawUnsafe(
      'INSERT OR IGNORE INTO ICADeveloperSubscription (organizationId,stripeCustomerId) VALUES (?,?)',
      organizationId, created.id
    );
    customer = (await rowFor(organizationId))?.stripeCustomerId;
  }
  if (!customer) throw new Error('DEVELOPER_CUSTOMER_NOT_FOUND');
  const sessions = await requestStripe<{ data: Array<{ status: string; mode: string; url?: string; metadata?: Record<string, string> }> }>(
    'checkout/sessions?customer=' + encodeURIComponent(customer) + '&limit=50'
  );
  const open = sessions.data.find(item => item.mode === 'subscription' && item.status === 'open' && item.metadata?.ica_developer_organization_id === organizationId);
  if (open) {
    if (open.metadata?.developer_plan !== plan || !open.url) throw new Error('DEVELOPER_CHECKOUT_ALREADY_OPEN');
    return { url: open.url };
  }
  const params = new URLSearchParams();
  params.set('mode', 'subscription');
  params.set('customer', customer);
  params.set('line_items[0][price]', id);
  params.set('line_items[0][quantity]', '1');
  params.set('client_reference_id', organizationId);
  params.set('metadata[ica_developer_organization_id]', organizationId);
  params.set('metadata[developer_plan]', plan);
  params.set('subscription_data[metadata][ica_developer_organization_id]', organizationId);
  params.set('subscription_data[metadata][developer_plan]', plan);
  params.set('success_url', companyOrigin() + '/workspace/developer-billing?checkout=success');
  params.set('cancel_url', companyOrigin() + '/workspace/developer-billing?checkout=cancelled');
  return requestStripe<{ url: string }>('checkout/sessions', { method: 'POST', body: params });
}

export async function createDeveloperPortal(organizationId: string) {
  if (!developerBillingReady()) throw new Error('DEVELOPER_BILLING_NOT_ACTIVE');
  await ensureDeveloperBillingTables();
  const row = await rowFor(organizationId);
  if (!row?.stripeCustomerId) throw new Error('DEVELOPER_CUSTOMER_NOT_FOUND');
  const config = (process.env.STRIPE_BILLING_PORTAL_CONFIGURATION_ID || '').trim();
  if (!config) throw new Error('DEVELOPER_PORTAL_NOT_CONFIGURED');
  const params = new URLSearchParams();
  params.set('customer', row.stripeCustomerId);
  params.set('configuration', config);
  params.set('return_url', companyOrigin() + '/workspace/developer-billing');
  return requestStripe<{ url: string }>('billing_portal/sessions', { method: 'POST', body: params });
}

async function applySubscription(subscription: StripeSubscription) {
  const org = subscription.metadata?.ica_developer_organization_id;
  if (!org) return false;
  if (!developerBillingReady()) return true; // Never treat a developer subscription as a workspace subscription
  await ensureDeveloperBillingTables();
  const row = await rowFor(org);
  const customer = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id;
  if (!row || row.stripeCustomerId !== customer) return true;
  const item = subscription.items.data[0];
  const plan: DeveloperPlan | null = subscription.items.data.length === 1 && item?.quantity === 1 ?
    item.price.id === priceId('starter') ? 'starter' :
    item.price.id === priceId('pro') ? 'pro' : null : null;
  const valid = plan && item.price.currency === 'usd' &&
    item.price.unit_amount === DEVELOPER_PLANS[plan].priceCents &&
    item.price.recurring?.interval === 'month' && item.price.recurring.interval_count === 1;
  await prisma.$executeRawUnsafe(
    'UPDATE ICADeveloperSubscription SET stripeSubscriptionId=?,plan=?,status=?,periodStart=?,periodEnd=?,updatedAt=CURRENT_TIMESTAMP WHERE organizationId=? AND stripeCustomerId=?',
    subscription.id, valid ? plan : null, valid ? subscription.status : 'invalid',
    valid ? item.current_period_start : 0, valid ? item.current_period_end : 0, org, customer
  );
  return true;
}

export async function handleDeveloperStripeEvent(event: { type?: string; data?: { object?: unknown } }) {
  const object = event.data?.object as Record<string, unknown> | undefined;
  if (!object) return false;
  if (event.type === 'checkout.session.completed' && object.metadata &&
      typeof object.metadata === 'object' && 'ica_developer_organization_id' in object.metadata) {
    const subscriptionId = typeof object.subscription === 'string' ? object.subscription : (object.subscription as { id?: string } | null)?.id;
    if (subscriptionId) await applySubscription(await requestStripe<StripeSubscription>('subscriptions/' + encodeURIComponent(subscriptionId)));
    return true;
  }
  if (event.type?.startsWith('customer.subscription.') && object.metadata && typeof object.metadata === 'object' &&
      'ica_developer_organization_id' in object.metadata) {
    const id = String(object.id || '');
    if (id) await applySubscription(await requestStripe<StripeSubscription>('subscriptions/' + encodeURIComponent(id)));
    return true;
  }
  return false;
}

export async function consumeDeveloperCalls(organizationId: string, grandfathered: boolean):
  Promise<{ allowed: boolean; status?: 402 | 429 }> {
  if (!developerBillingReady() || grandfathered) return { allowed: true };
  await ensureDeveloperBillingTables();
  const row = await rowFor(organizationId);
  if (!row?.stripeSubscriptionId) return { allowed: false, status: 402 }; // New keys require a paid developer plan
  if (!active.has(row.status) || row.periodEnd <= Math.floor(Date.now() / 1000) ||
      !row.plan || !(row.plan in DEVELOPER_PLANS)) return { allowed: false, status: 402 };
  const max = DEVELOPER_PLANS[row.plan as DeveloperPlan].monthlyCalls;
  const count = await prisma.$queryRawUnsafe<Array<{ used: number }>>(
    'INSERT INTO ICADeveloperUsage (organizationId,periodStart,used) VALUES (?,?,1) ON CONFLICT(organizationId,periodStart) DO UPDATE SET used=used+1 WHERE used<? RETURNING used',
    organizationId, row.periodStart, max
  );
  return { allowed: Boolean(count.length), ...(count.length ? {} : { status: 429 as const }) };
}
