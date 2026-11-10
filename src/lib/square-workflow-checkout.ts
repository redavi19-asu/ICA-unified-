import { createHmac, timingSafeEqual } from 'node:crypto';
import { prisma } from './prisma';
import { getSquareMerchantStatus, squareCheckoutEnabled, squareConfig, squareMerchantApi } from './square-connect';
import { getWorkflowSubmission, type PublicWorkflow } from './workflow-execution';

/**
 * Square collection belongs to the merchant; ICA's SaaS Stripe subscription is unrelated.
 * Square never marks a submission PAID without a verified merchant-scoped Square Payment.
 */
type CheckoutRecord = {
  submissionId: string;
  organizationId: string;
  workflowId: string;
  merchantId: string;
  orderId: string;
  linkId: string;
  locationId: string;
  amountCents: number;
  currency: string;
  checkoutUrl: string;
  status: string;
  paymentId: string | null;
};

type SquareOrder = {
  id: string;
  location_id?: string;
  state?: string;
  total_money?: { amount: number; currency: string };
  tenders?: Array<{ payment_id?: string; amount_money?: { amount: number; currency: string } }>;
};
type SquarePayment = {
  id: string;
  status: string;
  order_id?: string;
  location_id?: string;
  amount_money?: { amount: number; currency: string };
};

let ready: Promise<void> | null = null;
async function ensureCheckoutTable() {
  if (!ready) {
    ready = (async () => {
      await prisma.$executeRawUnsafe(
        'CREATE TABLE IF NOT EXISTS SquareBusinessCheckout (' +
        'submissionId TEXT PRIMARY KEY NOT NULL, organizationId TEXT NOT NULL, workflowId TEXT NOT NULL, ' +
        'merchantId TEXT NOT NULL, orderId TEXT NOT NULL UNIQUE, linkId TEXT NOT NULL, locationId TEXT NOT NULL, ' +
        'amountCents INTEGER NOT NULL, currency TEXT NOT NULL DEFAULT \'USD\', checkoutUrl TEXT NOT NULL, ' +
        'status TEXT NOT NULL DEFAULT \'PENDING\', paymentId TEXT, ' +
        'createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, paidAt TEXT)'
      );
      await prisma.$executeRawUnsafe(
        'CREATE INDEX IF NOT EXISTS SquareBusinessCheckout_org_order ON SquareBusinessCheckout (organizationId, orderId)'
      );
    })().catch((error) => { ready = null; throw error; });
  }
  return ready;
}

export function verifySquareWebhookSignature(rawBody: string, received: string): boolean {
  const key = (process.env.SQUARE_WEBHOOK_SIGNATURE_KEY || '').trim();
  const url = (process.env.SQUARE_WEBHOOK_NOTIFICATION_URL || '').trim();
  if (!key || !url || !received) return false;
  const expected = createHmac('sha256', key).update(url + rawBody, 'utf8').digest();
  const candidate = Buffer.from(received, 'base64');
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

export function squareOneTimeOnly(kind: PublicWorkflow['kind'], cadence: string) {
  return kind === 'EVENT' || !['MONTHLY', 'YEARLY'].includes(cadence.toUpperCase());
}

export function squareQuickPayPayload(input: {
  workflowName: string;
  amountCents: number;
  locationId: string;
  submissionId: string;
  redirectUrl: string;
}) {
  if (!Number.isSafeInteger(input.amountCents) || input.amountCents < 1 || input.amountCents > 100_000_000) {
    throw new Error('Invalid Square transaction amount.');
  }
  if (!/^https:\/\/[^/]+/.test(input.redirectUrl)) throw new Error('Secure Square return address required.');
  return {
    idempotency_key: 'ica-square-' + input.submissionId,
    description: 'ICA Unified business collection',
    payment_note: 'ICA Unified submission ' + input.submissionId,
    quick_pay: {
      location_id: input.locationId,
      name: input.workflowName.slice(0, 160),
      price_money: { amount: input.amountCents, currency: 'USD' },
    },
    checkout_options: {
      allow_tipping: false,
      redirect_url: input.redirectUrl,
    },
  };
}

function checkoutRow(organizationId: string, workflowId: string, submissionId: string) {
  return prisma.$queryRawUnsafe<CheckoutRecord[]>(
    'SELECT * FROM SquareBusinessCheckout WHERE submissionId = ? AND organizationId = ? AND workflowId = ? LIMIT 1',
    submissionId, organizationId, workflowId
  );
}

/** Called only after the public workflow form has validated and saved the submission. */
export async function createSquareWorkflowCheckout(input: {
  workflow: PublicWorkflow;
  submissionId: string;
  origin: string;
}) {
  if (!squareCheckoutEnabled()) throw new Error('SQUARE_CHECKOUT_DISABLED');
  if (!squareOneTimeOnly(input.workflow.kind, String(input.workflow.config.billingCadence || 'ONE_TIME'))) {
    throw new Error('SQUARE_RECURRING_REQUIRES_PLAN_SUPPORT');
  }
  await ensureCheckoutTable();

  const submission = await getWorkflowSubmission(input.workflow.organizationId, input.workflow.id, input.submissionId);
  if (!submission || submission.amountCents < 1 || submission.paymentStatus !== 'PENDING') {
    throw new Error('INVALID_SQUARE_WORKFLOW_SUBMISSION');
  }

  const merchant = await getSquareMerchantStatus(input.workflow.organizationId);
  if (!merchant || merchant.mode !== squareConfig().mode || merchant.status !== 'CONNECTED' || !merchant.locationId) {
    throw new Error('SQUARE_ORGANIZATION_NOT_READY');
  }

  const existing = (await checkoutRow(input.workflow.organizationId, input.workflow.id, input.submissionId))[0];
  if (existing) {
    if (existing.status === 'PAID') throw new Error('PAYMENT_ALREADY_COMPLETE');
    if (existing.amountCents !== submission.amountCents || existing.merchantId !== merchant.merchantId ||
        existing.locationId !== merchant.locationId) {
      throw new Error('SQUARE_CHECKOUT_MISMATCH');
    }
    return { checkoutUrl: existing.checkoutUrl, sessionId: existing.orderId, provider: 'SQUARE' as const };
  }

  // Square redirects only to our configured app origin, never a caller-supplied Host header.
  const origin = new URL((process.env.NEXT_PUBLIC_APP_URL || process.env.APP_BASE_URL ||
    'https://unified.icomputeranything.com').trim());
  if (origin.protocol !== 'https:') throw new Error('SQUARE_RETURN_MUST_BE_HTTPS');
  const returnUrl = new URL('/flow/' + encodeURIComponent(input.workflow.id) + '/complete', origin);
  returnUrl.searchParams.set('square', '1');
  returnUrl.searchParams.set('submission', submission.id);

  const body = squareQuickPayPayload({
    workflowName: input.workflow.name,
    amountCents: submission.amountCents,
    locationId: merchant.locationId,
    submissionId: submission.id,
    redirectUrl: returnUrl.toString(),
  });

  const data = await squareMerchantApi<{ payment_link?: {
    id?: string; order_id?: string; url?: string;
  } }>(input.workflow.organizationId, '/v2/online-checkout/payment-links', {
    method: 'POST', body,
  });
  const link = data.payment_link;
  if (!link?.id || !link.order_id || !link.url || new URL(link.url).protocol !== 'https:') {
    throw new Error('SQUARE_HOSTED_CHECKOUT_MISSING');
  }

  // Payment link creation is Square-idempotent per submission; INSERT guards local retries.
  await prisma.$executeRawUnsafe(
    'INSERT INTO SquareBusinessCheckout ' +
    '(submissionId, organizationId, workflowId, merchantId, orderId, linkId, locationId, amountCents, currency, checkoutUrl) ' +
    'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(submissionId) DO NOTHING',
    submission.id, input.workflow.organizationId, input.workflow.id, merchant.merchantId,
    link.order_id, link.id, merchant.locationId, submission.amountCents, 'USD', link.url
  );
  const stored = (await checkoutRow(input.workflow.organizationId, input.workflow.id, submission.id))[0];
  if (!stored || stored.orderId !== link.order_id || stored.merchantId !== merchant.merchantId ||
      stored.amountCents !== submission.amountCents) {
    throw new Error('SQUARE_CHECKOUT_STORAGE_MISMATCH');
  }
  return { checkoutUrl: stored.checkoutUrl, sessionId: stored.orderId, provider: 'SQUARE' as const };
}

/** Returns a verified result. A browser redirect alone is NEVER proof of payment. */
export async function confirmSquareWorkflowCheckout(input: {
  workflowId: string;
  submissionId: string;
  origin: string;
}) {
  if (!squareCheckoutEnabled()) throw new Error('SQUARE_CHECKOUT_DISABLED');
  await ensureCheckoutTable();
  const rows = await prisma.$queryRawUnsafe<CheckoutRecord[]>(
    'SELECT * FROM SquareBusinessCheckout WHERE workflowId = ? AND submissionId = ? LIMIT 1',
    input.workflowId, input.submissionId
  );
  const checkout = rows[0];
  if (!checkout) throw new Error('SQUARE_CHECKOUT_NOT_FOUND');
  return verifySquareCheckoutRecord(checkout, input.origin);
}

async function verifySquareCheckoutRecord(checkout: CheckoutRecord, origin: string) {
  const submission = await getWorkflowSubmission(checkout.organizationId, checkout.workflowId, checkout.submissionId);
  if (!submission || submission.amountCents !== checkout.amountCents) {
    throw new Error('SQUARE_SUBMISSION_AMOUNT_MISMATCH');
  }
  const merchant = await getSquareMerchantStatus(checkout.organizationId);
  // Location may change later: compare transaction against the location saved at checkout, not today's default.
  if (!merchant || merchant.mode !== squareConfig().mode || merchant.merchantId !== checkout.merchantId) {
    throw new Error('SQUARE_MERCHANT_MISMATCH');
  }
  if (submission.paymentStatus === 'PAID' && checkout.status === 'PAID') {
    return { paid: true, status: submission.status, activationUrl: null };
  }

  const orderResult = await squareMerchantApi<{ order?: SquareOrder }>(
    checkout.organizationId, '/v2/orders/' + encodeURIComponent(checkout.orderId)
  );
  const order = orderResult.order;
  if (!order || order.id !== checkout.orderId || order.location_id !== checkout.locationId) {
    throw new Error('SQUARE_ORDER_MISMATCH');
  }
  if (order.total_money?.currency !== 'USD' || order.total_money?.amount !== checkout.amountCents) {
    throw new Error('SQUARE_ORDER_AMOUNT_MISMATCH');
  }

  const tenderPayments = (order.tenders || []).map((tender) => tender.payment_id).filter(Boolean) as string[];
  if (tenderPayments.length !== 1) {
    return { paid: false, status: submission.status, activationUrl: null };
  }
  const paymentResult = await squareMerchantApi<{ payment?: SquarePayment }>(
    checkout.organizationId, '/v2/payments/' + encodeURIComponent(tenderPayments[0])
  );
  const payment = paymentResult.payment;
  if (!payment || payment.id !== tenderPayments[0] || payment.order_id !== checkout.orderId ||
      payment.location_id !== checkout.locationId || payment.amount_money?.currency !== 'USD' ||
      payment.amount_money.amount !== checkout.amountCents) {
    throw new Error('SQUARE_PAYMENT_MISMATCH');
  }
  if (payment.status !== 'COMPLETED') {
    return { paid: false, status: submission.status, activationUrl: null };
  }

  const { finalizeVerifiedBusinessWorkflowPayment } = await import('./member-payments');
  const result = await finalizeVerifiedBusinessWorkflowPayment({
    organizationId: checkout.organizationId,
    workflowId: checkout.workflowId,
    submissionId: checkout.submissionId,
    receiptId: 'square:' + payment.id,
    origin,
  });
  await prisma.$executeRawUnsafe(
    "UPDATE SquareBusinessCheckout SET status = 'PAID', paymentId = ?, paidAt = CURRENT_TIMESTAMP " +
    "WHERE submissionId = ? AND organizationId = ? AND orderId = ?",
    payment.id, checkout.submissionId, checkout.organizationId, checkout.orderId
  );
  return result;
}

/** Webhooks trigger server-to-server verification using Square's API. */
export async function reconcileSquareWebhookOrder(orderId: string, merchantId: string, origin: string) {
  if (!squareCheckoutEnabled()) throw new Error('SQUARE_CHECKOUT_DISABLED');
  await ensureCheckoutTable();
  const rows = await prisma.$queryRawUnsafe<CheckoutRecord[]>(
    'SELECT * FROM SquareBusinessCheckout WHERE orderId = ? AND merchantId = ? LIMIT 1',
    orderId, merchantId
  );
  if (!rows[0]) return { found: false };
  const result = await verifySquareCheckoutRecord(rows[0], origin);
  return { found: true, paid: result.paid };
}

export async function findSquareRefundSource(organizationId: string, workflowId: string, submissionId: string) {
  await ensureCheckoutTable();
  const rows = await checkoutRow(organizationId, workflowId, submissionId);
  const row = rows[0];
  if (!row || row.status !== 'PAID' || !row.paymentId) return null;
  return { provider: 'SQUARE' as const, merchantId: row.merchantId, paymentId: row.paymentId, amountCents: row.amountCents };
}
