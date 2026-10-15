import Stripe from "stripe";
import { organizationHasUnifiedAccess } from "./auth";
import { createHash } from "node:crypto";
import { prisma } from "./prisma";
import { ensureBillingProfile } from "./organization-ops";
import { apiRevenueDatabase } from "./api-revenue-database";
import { ensureApiRevenue } from "./api-revenue";
export const API_PRODUCT = "ica-unified-api";
export function apiPlanConfiguration() {
  const priceId = (process.env.STRIPE_API_PRICE_ID || "").trim(),
    amount = Number(process.env.API_MONTHLY_AMOUNT_CENTS),
    allowance = Number(process.env.API_MONTHLY_REQUEST_ALLOWANCE);
  const ready = Boolean(
    process.env.API_PAID_ACCESS_REQUIRED === "true" &&
    priceId &&
    Number.isSafeInteger(amount) &&
    amount > 0 &&
    Number.isSafeInteger(allowance) &&
    allowance > 0 &&
    (process.env.STRIPE_SECRET_KEY || "").trim() &&
    (process.env.STRIPE_WEBHOOK_SECRET || "").trim(),
  );
  return {
    ready,
    priceId,
    amount: ready ? amount : null,
    allowance: ready ? allowance : null,
  };
}
function client() {
  const key = (process.env.STRIPE_SECRET_KEY || "").trim();
  if (!key) throw new Error("API_BILLING_NOT_CONFIGURED");
  return new Stripe(key, { httpClient: Stripe.createFetchHttpClient() });
}
function verifiedPrice(price: Stripe.Price) {
  const c = apiPlanConfiguration();
  return (
    c.ready &&
    price.id === c.priceId &&
    price.active &&
    price.currency === "usd" &&
    price.unit_amount === c.amount &&
    price.recurring?.interval === "month" &&
    price.recurring.interval_count === 1
  );
}
export async function createApiCheckout(input: {
  organizationId: string;
  organizationName: string;
  email: string;
  origin: string;
}) {
  const config = apiPlanConfiguration();
  if (!config.ready) throw new Error("API_BILLING_NOT_CONFIGURED");
  const organization = await prisma.organization.findUnique({
    where: { id: input.organizationId },
    select: {
      id: true,
      slug: true,
      status: true,
      plan: true,
      trialEndsAt: true,
    },
  });
  if (!organization || !(await organizationHasUnifiedAccess(organization)))
    throw new Error("SOFTWARE_SUBSCRIPTION_REQUIRED");
  const db = apiRevenueDatabase();
  await ensureApiRevenue(db);
  const stripe = client();
  if (!verifiedPrice(await stripe.prices.retrieve(config.priceId)))
    throw new Error("API_PRICE_REVIEW_REQUIRED");
  const billing = await ensureBillingProfile(input.organizationId);
  let customerId = billing?.providerCustomerId;
  if (!customerId) {
    const customer = await stripe.customers.create(
      {
        name: input.organizationName,
        email: input.email,
        metadata: { organizationId: input.organizationId },
      },
      { idempotencyKey: `unified-api-customer-${input.organizationId}` },
    );
    await prisma.$executeRawUnsafe(
      "UPDATE OrganizationBillingProfile SET providerCustomerId=? WHERE organizationId=? AND providerCustomerId IS NULL",
      customer.id,
      input.organizationId,
    );
    customerId = (await ensureBillingProfile(input.organizationId))
      ?.providerCustomerId;
  }
  if (!customerId) throw new Error("API_CUSTOMER_NOT_LINKED");
  await db.run(
    "INSERT INTO ApiAccessSubscription(organizationId,customerId,status) VALUES (?,?,'pending') ON CONFLICT(organizationId) DO UPDATE SET customerId=excluded.customerId WHERE ApiAccessSubscription.customerId IS NULL",
    input.organizationId,
    customerId,
  );
  const [owner] = await db.all<{ customerId: string }>(
    "SELECT customerId FROM ApiAccessSubscription WHERE organizationId=?",
    input.organizationId,
  );
  if (owner?.customerId !== customerId)
    throw new Error("API_CUSTOMER_REVIEW_REQUIRED");
  const subscriptions = await stripe.subscriptions.list({
    customer: customerId,
    status: "all",
    limit: 100,
  });
  if (subscriptions.has_more)
    throw new Error("API_SUBSCRIPTION_REVIEW_REQUIRED");
  const apiSubscriptions = subscriptions.data.filter(
    (s) =>
      s.metadata.product === API_PRODUCT ||
      s.items.data.some((i) => i.price.id === config.priceId),
  );
  if (
    apiSubscriptions.some(
      (s) => !["canceled", "incomplete_expired"].includes(s.status),
    )
  )
    throw new Error("API_SUBSCRIPTION_EXISTS");
  const sessions = await stripe.checkout.sessions.list({
    customer: customerId,
    limit: 100,
  });
  if (sessions.has_more) throw new Error("API_CHECKOUT_REVIEW_REQUIRED");
  const apiSessions = sessions.data.filter(
    (s) =>
      s.metadata?.product === API_PRODUCT &&
      s.client_reference_id === input.organizationId,
  );
  const open = apiSessions.find((s) => s.status === "open");
  if (open?.url) return open.url;
  await db.run(
    "UPDATE ApiAccessSubscription SET priceId=?,requestAllowance=?,monthlyAmountCents=? WHERE organizationId=? AND status IN ('pending','not_connected','canceled','incomplete_expired')",
    config.priceId,
    config.allowance,
    config.amount,
    input.organizationId,
  );

  const checkout = await stripe.checkout.sessions.create(
    {
      mode: "subscription",
      customer: customerId,
      client_reference_id: input.organizationId,
      line_items: [{ price: config.priceId, quantity: 1 }],
      metadata: { product: API_PRODUCT },
      subscription_data: { metadata: { product: API_PRODUCT } },
      integration_identifier: `ica_api_${Array.from(
        createHash("sha256")
          .update(
            input.organizationId +
              config.priceId +
              (apiSubscriptions[0]?.id || "initial") +
              (apiSessions[0]?.id || "initial"),
          )
          .digest()
          .subarray(0, 8),
        (v) => String.fromCharCode(97 + (v % 26)),
      ).join("")}`,
      success_url: `${input.origin}/api-billing?api_checkout=received`,
      cancel_url: `${input.origin}/api-billing?api_checkout=cancelled`,
    },
    {
      idempotencyKey: `unified-api-checkout-${input.organizationId}-${config.priceId}-${apiSubscriptions[0]?.id || "initial"}-${apiSessions[0]?.id || "initial"}`,
    },
  );
  if (!checkout.url) throw new Error("API_CHECKOUT_UNAVAILABLE");
  return checkout.url;
}
export async function handleApiRevenueEvent(event: {
  type?: string;
  data?: { object?: unknown };
}) {
  const object = event.data?.object as Record<string, unknown> | undefined;
  if (!object) return false;
  const db = apiRevenueDatabase();
  await ensureApiRevenue(db);
  let subscriptionId: string | null = null;
  if (event.type?.startsWith("customer.subscription."))
    subscriptionId = String(object.id || "");
  if (
    event.type === "checkout.session.completed" ||
    event.type === "checkout.session.async_payment_succeeded"
  ) {
    const metadata = object.metadata as Record<string, unknown> | undefined;
    if (metadata?.product !== API_PRODUCT) return false;
    if (
      object.mode !== "subscription" ||
      !["paid", "no_payment_required"].includes(String(object.payment_status))
    )
      return true;
    subscriptionId =
      typeof object.subscription === "string" ? object.subscription : null;
    if (!subscriptionId) throw new Error("API_SUBSCRIPTION_MISSING");
  }
  if (
    event.type === "invoice.paid" ||
    event.type === "invoice.payment_failed"
  ) {
    const parent = object.parent as
      | { subscription_details?: { subscription?: string | { id?: string } } }
      | undefined;
    const value = parent?.subscription_details?.subscription;
    subscriptionId = typeof value === "string" ? value : value?.id || null;
    if (subscriptionId) {
      const known = await db.all(
        "SELECT organizationId FROM ApiAccessSubscription WHERE subscriptionId=?",
        subscriptionId,
      );
      if (!known.length) return false;
    }
  }
  if (!subscriptionId) return false;
  const config = apiPlanConfiguration();
  const [known] = await db.all<{ organizationId: string }>(
    "SELECT organizationId FROM ApiAccessSubscription WHERE subscriptionId=?",
    subscriptionId,
  );
  const metadata = object.metadata as Record<string, unknown> | undefined;
  const items = object.items as
    { data?: { price?: { id?: string } }[] } | undefined;
  if (
    event.type?.startsWith("customer.subscription.") &&
    !known &&
    metadata?.product !== API_PRODUCT &&
    !items?.data?.some(
      (item) => item.price?.id === config.priceId && Boolean(config.priceId),
    )
  )
    return false;
  // Resolve the provider's current subscription/customer, not event metadata or
  // a stale event's status. Main software access is never changed here.
  const stripe = client();
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const customerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer.id;
  const [mapped] = await db.all<{
    organizationId: string;
    subscriptionId: string | null;
    status: string;
    priceId: string | null;
    requestAllowance: number | null;
    monthlyAmountCents: number | null;
  }>(
    "SELECT organizationId,subscriptionId,status,priceId,requestAllowance,monthlyAmountCents FROM ApiAccessSubscription WHERE customerId=?",
    customerId,
  );
  const looksLikeApi = subscription.items.data.some(
    (i) => i.price.id === config.priceId || i.price.id === mapped?.priceId,
  );
  if (!looksLikeApi && mapped?.subscriptionId !== subscription.id) return false;
  if (
    !mapped ||
    (!config.ready &&
      !(mapped.priceId && mapped.monthlyAmountCents && mapped.requestAllowance))
  )
    throw new Error("API_SUBSCRIPTION_REVIEW_REQUIRED");
  if (
    mapped.subscriptionId &&
    mapped.subscriptionId !== subscription.id &&
    !["canceled", "incomplete_expired", "not_connected", "pending"].includes(
      mapped.status,
    )
  )
    throw new Error("API_DUPLICATE_SUBSCRIPTION");
  const item = subscription.items.data[0];
  const expectedPrice = mapped.priceId || config.priceId;
  const expectedAmount = mapped.monthlyAmountCents ?? config.amount;
  const allowance = mapped.requestAllowance ?? config.allowance;
  const valid =
    subscription.items.data.length === 1 &&
    item.quantity === 1 &&
    item.price.id === expectedPrice &&
    item.price.currency === "usd" &&
    item.price.unit_amount === expectedAmount &&
    item.price.recurring?.interval === "month" &&
    item.price.recurring.interval_count === 1;
  const status = valid ? subscription.status : "invalid_price";
  await db.run(
    `UPDATE ApiAccessSubscription SET subscriptionId=?,status=?,periodStart=?,periodEnd=?,requestAllowance=?,priceId=?,monthlyAmountCents=?,updatedAt=CURRENT_TIMESTAMP
 WHERE organizationId=? AND customerId=? AND subscriptionId IS ?`,
    subscription.id,
    status,
    item.current_period_start * 1000,
    item.current_period_end * 1000,
    allowance,
    expectedPrice,
    expectedAmount,
    mapped.organizationId,
    customerId,
    mapped.subscriptionId,
  );
  return true;
}

export async function cancelApiRenewal(organizationId: string) {
  const db = apiRevenueDatabase();
  await ensureApiRevenue(db);
  const [row] = await db.all<{
    customerId: string;
    subscriptionId: string;
    priceId: string;
  }>(
    "SELECT customerId,subscriptionId,priceId FROM ApiAccessSubscription WHERE organizationId=?",
    organizationId,
  );
  if (!row?.subscriptionId || !row.priceId)
    throw new Error("API_SUBSCRIPTION_UNAVAILABLE");
  const stripe = client();
  const subscription = await stripe.subscriptions.retrieve(row.subscriptionId);
  const customer =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer.id;
  if (
    customer !== row.customerId ||
    subscription.items.data.length !== 1 ||
    subscription.items.data[0].price.id !== row.priceId
  )
    throw new Error("API_SUBSCRIPTION_REVIEW_REQUIRED");
  await stripe.subscriptions.update(
    subscription.id,
    { cancel_at_period_end: true },
    {
      idempotencyKey: `unified-api-cancel-${subscription.id}-${subscription.items.data[0].current_period_end}`,
    },
  );
  return { endsAt: subscription.items.data[0].current_period_end * 1000 };
}
