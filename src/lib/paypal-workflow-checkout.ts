import { prisma } from './prisma';
import { paypalPartnerApi, getPayPalMerchantStatus, paypalPartnerConfig } from './paypal-connect';
import { getWorkflowSubmission, type PublicWorkflow } from './workflow-execution';

type PayPalOrder = {
  id?: string;
  status?: string;
  purchase_units?: Array<{
    custom_id?: string;
    payee?: { merchant_id?: string };
    amount?: { currency_code?: string; value?: string };
    payments?: { captures?: Array<{
      id?: string;
      status?: string;
      amount?: { currency_code?: string; value?: string };
    }> };
  }>;
  links?: Array<{ rel?: string; href?: string }>;
};
type PayPalCheckout = {
  organizationId: string;
  workflowId: string;
  submissionId: string;
  merchantId: string;
  orderId: string;
  checkoutUrl: string;
  amountCents: number;
  currency: string;
  environment: string;
  status: string;
  captureId: string | null;
};
let tablesReady: Promise<void> | null = null;
async function ensureTable() {
  if (!tablesReady) {
    tablesReady = prisma.$executeRawUnsafe(
      'CREATE TABLE IF NOT EXISTS PayPalBusinessCheckout (' +
      'submissionId TEXT PRIMARY KEY NOT NULL, organizationId TEXT NOT NULL, workflowId TEXT NOT NULL, ' +
      'merchantId TEXT NOT NULL, orderId TEXT NOT NULL UNIQUE, checkoutUrl TEXT NOT NULL, ' +
      'amountCents INTEGER NOT NULL, currency TEXT NOT NULL DEFAULT \'USD\', environment TEXT NOT NULL, ' +
      'status TEXT NOT NULL DEFAULT \'PENDING\', captureId TEXT, ' +
      'createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, completedAt TEXT)'
    ).then(() => undefined).catch((error) => { tablesReady = null; throw error; });
  }
  return tablesReady;
}

export function paypalAmountCents(value: string | undefined): number | null {
  if (typeof value !== 'string' || !/^\d{1,8}\.\d{2}$/.test(value)) return null;
  const [whole, fraction] = value.split('.');
  const amount = Number(whole) * 100 + Number(fraction);
  return Number.isSafeInteger(amount) ? amount : null;
}

export function paypalOrderCaptured(
  order: PayPalOrder,
  expected: {
    orderId: string;
    merchantId: string;
    submissionId: string;
    amountCents: number;
  },
): { captured: boolean; captureId: string | null } {
  if (order.id !== expected.orderId || order.status !== 'COMPLETED' ||
      order.purchase_units?.length !== 1) return { captured: false, captureId: null };
  const unit = order.purchase_units[0];
  if (unit.payee?.merchant_id !== expected.merchantId ||
      unit.custom_id !== expected.submissionId ||
      unit.amount?.currency_code !== 'USD' ||
      paypalAmountCents(unit.amount.value) !== expected.amountCents) {
    return { captured: false, captureId: null };
  }
  const captures = unit.payments?.captures || [];
  if (captures.length !== 1 || !captures[0].id || captures[0].status !== 'COMPLETED' ||
      captures[0].amount?.currency_code !== 'USD' ||
      paypalAmountCents(captures[0].amount?.value) !== expected.amountCents) {
    return { captured: false, captureId: null };
  }
  return { captured: true, captureId: captures[0].id };
}

export function paypalCheckoutEnabled() {
  const cfg = paypalPartnerConfig();
  return cfg.configured &&
    process.env.PAYPAL_CUSTOMER_CHECKOUT_ENABLED === 'true' &&
    Boolean(String(process.env.PAYPAL_WEBHOOK_ID || '').trim()) &&
    (cfg.environment !== 'production' || process.env.PAYPAL_PRODUCTION_CHECKOUT_APPROVED === 'true') &&
    (cfg.environment !== 'sandbox' || process.env.NODE_ENV !== 'production');
}

function paymentRow(organizationId: string, workflowId: string, submissionId: string) {
  return prisma.$queryRawUnsafe<PayPalCheckout[]>(
    'SELECT * FROM PayPalBusinessCheckout WHERE organizationId = ? AND workflowId = ? AND submissionId = ? LIMIT 1',
    organizationId, workflowId, submissionId
  );
}

export async function createPayPalWorkflowCheckout(input: {
  workflow: PublicWorkflow;
  submissionId: string;
  origin: string;
}) {
  if (!paypalCheckoutEnabled()) throw new Error('PAYPAL_CHECKOUT_DISABLED');
  if (input.workflow.kind === 'MEMBERSHIP' &&
      ['MONTHLY', 'YEARLY'].includes(String(input.workflow.config.billingCadence || 'ONE_TIME').toUpperCase())) {
    throw new Error('PAYPAL_RECURRING_NOT_CONFIGURED');
  }
  const orgId = input.workflow.organizationId;
  const submission = await getWorkflowSubmission(orgId, input.workflow.id, input.submissionId);
  if (!submission || submission.amountCents <= 0 || submission.paymentStatus !== 'PENDING' ||
      submission.amountCents > 100_000_000) {
    throw new Error('PAYPAL_SUBMISSION_NOT_ELIGIBLE');
  }
  const merchant = await getPayPalMerchantStatus(orgId);
  const cfg = paypalPartnerConfig();
  if (merchant.connectionStatus !== 'CONNECTED' || !merchant.merchantId ||
      merchant.environment !== cfg.environment) throw new Error('PAYPAL_MERCHANT_NOT_READY');

  await ensureTable();
  const existing = (await paymentRow(orgId, input.workflow.id, submission.id))[0];
  if (existing) {
    if (existing.amountCents !== submission.amountCents || existing.merchantId !== merchant.merchantId ||
        existing.environment !== cfg.environment) throw new Error('PAYPAL_CHECKOUT_CHANGED');
    if (existing.status === 'PAID') throw new Error('PAYPAL_ALREADY_PAID');
    return { checkoutUrl: existing.checkoutUrl, sessionId: existing.orderId, provider: 'PAYPAL' as const };
  }

  const fixedAppOrigin = new URL((process.env.NEXT_PUBLIC_APP_URL || process.env.APP_BASE_URL ||
    'https://unified.icomputeranything.com').trim());
  if (fixedAppOrigin.protocol !== 'https:') throw new Error('PAYPAL_RETURN_NOT_SECURE');
  const approvedReturn = new URL('/flow/' + encodeURIComponent(input.workflow.id) + '/complete', fixedAppOrigin);
  approvedReturn.searchParams.set('paypal', '1');
  approvedReturn.searchParams.set('submission', submission.id);
  const cancelReturn = new URL('/flow/' + encodeURIComponent(input.workflow.id), fixedAppOrigin);
  cancelReturn.searchParams.set('payment', 'cancelled');

  const order = await paypalPartnerApi<PayPalOrder>('/v2/checkout/orders', {
    method: 'POST',
    merchantId: merchant.merchantId,
    requestId: 'ica-order-' + submission.id,
    body: {
      intent: 'CAPTURE',
      purchase_units: [{
        custom_id: submission.id,
        reference_id: input.workflow.id,
        description: input.workflow.name.slice(0, 127),
        payee: { merchant_id: merchant.merchantId },
        amount: { currency_code: 'USD', value: (submission.amountCents / 100).toFixed(2) },
      }],
      application_context: {
        return_url: approvedReturn.toString(),
        cancel_url: cancelReturn.toString(),
        shipping_preference: 'NO_SHIPPING',
        user_action: 'PAY_NOW',
      },
    },
  });
  const approveUrl = order.links?.find((link) => link.rel === 'approve')?.href || '';
  const parsed = new URL(approveUrl);
  const trustedHost = cfg.environment === 'production' ? 'www.paypal.com' : 'www.sandbox.paypal.com';
  if (!order.id || !/^[A-Za-z0-9_-]{8,130}$/.test(order.id) ||
      parsed.protocol !== 'https:' || parsed.hostname !== trustedHost) {
    throw new Error('PAYPAL_CHECKOUT_URL_INVALID');
  }
  await prisma.$executeRawUnsafe(
    'INSERT INTO PayPalBusinessCheckout ' +
    '(submissionId, organizationId, workflowId, merchantId, orderId, checkoutUrl, amountCents, environment) ' +
    'VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(submissionId) DO NOTHING',
    submission.id, orgId, input.workflow.id, merchant.merchantId, order.id,
    approveUrl, submission.amountCents, cfg.environment
  );
  const saved = (await paymentRow(orgId, input.workflow.id, submission.id))[0];
  if (!saved || saved.orderId !== order.id || saved.merchantId !== merchant.merchantId ||
      saved.amountCents !== submission.amountCents) throw new Error('PAYPAL_CHECKOUT_RECORD_CONFLICT');
  return { checkoutUrl: saved.checkoutUrl, sessionId: saved.orderId, provider: 'PAYPAL' as const };
}

async function verifyCapturedPayPalCheckout(checkout: PayPalCheckout, origin: string, buyerReturned: boolean) {
  const merchant = await getPayPalMerchantStatus(checkout.organizationId);
  if (!paypalCheckoutEnabled() || merchant.connectionStatus !== 'CONNECTED' ||
      merchant.merchantId !== checkout.merchantId || merchant.environment !== checkout.environment) {
    throw new Error('PAYPAL_MERCHANT_CHECK_FAILED');
  }
  const submission = await getWorkflowSubmission(checkout.organizationId, checkout.workflowId, checkout.submissionId);
  if (!submission || submission.amountCents !== checkout.amountCents) {
    throw new Error('PAYPAL_SUBMISSION_MISMATCH');
  }
  if (checkout.status === 'PAID' && submission.paymentStatus === 'PAID') {
    return { paid: true, status: submission.status, activationUrl: null };
  }
  const path = '/v2/checkout/orders/' + encodeURIComponent(checkout.orderId);
  let order = await paypalPartnerApi<PayPalOrder>(path, { merchantId: checkout.merchantId });
  // Only a buyer returned from PayPal's approval page triggers a capture.
  // Webhook notifications only re-read the actual capture; they cannot charge.
  if (order.status === 'APPROVED' && buyerReturned) {
    await paypalPartnerApi<PayPalOrder>(path + '/capture', {
      method: 'POST',
      merchantId: checkout.merchantId,
      requestId: 'ica-capture-' + checkout.submissionId,
      body: {},
    });
    order = await paypalPartnerApi<PayPalOrder>(path, { merchantId: checkout.merchantId });
  }
  const result = paypalOrderCaptured(order, {
    orderId: checkout.orderId,
    merchantId: checkout.merchantId,
    submissionId: checkout.submissionId,
    amountCents: checkout.amountCents,
  });
  if (!result.captured || !result.captureId) {
    return { paid: false, status: submission.status, activationUrl: null };
  }
  const { finalizeVerifiedBusinessWorkflowPayment } = await import('./member-payments');
  const saved = await finalizeVerifiedBusinessWorkflowPayment({
    organizationId: checkout.organizationId,
    workflowId: checkout.workflowId,
    submissionId: checkout.submissionId,
    receiptId: 'paypal:' + result.captureId,
    origin,
  });
  await prisma.$executeRawUnsafe(
    "UPDATE PayPalBusinessCheckout SET status = 'PAID', captureId = ?, completedAt = CURRENT_TIMESTAMP " +
    'WHERE organizationId = ? AND submissionId = ? AND orderId = ?',
    result.captureId, checkout.organizationId, checkout.submissionId, checkout.orderId
  );
  return saved;
}

export async function confirmPayPalWorkflowCheckout(input: {
  workflowId: string;
  submissionId: string;
  returnedOrderId: string;
  origin: string;
}) {
  if (!paypalCheckoutEnabled()) throw new Error('PAYPAL_CHECKOUT_DISABLED');
  await ensureTable();
  const rows = await prisma.$queryRawUnsafe<PayPalCheckout[]>(
    'SELECT * FROM PayPalBusinessCheckout WHERE workflowId = ? AND submissionId = ? LIMIT 1',
    input.workflowId, input.submissionId
  );
  const record = rows[0];
  if (!record || record.orderId !== input.returnedOrderId) throw new Error('PAYPAL_ORDER_MISMATCH');
  return verifyCapturedPayPalCheckout(record, input.origin, true);
}

export async function reconcilePayPalWebhookOrder(orderId: string, origin: string) {
  if (!paypalCheckoutEnabled()) throw new Error('PAYPAL_CHECKOUT_DISABLED');
  await ensureTable();
  const rows = await prisma.$queryRawUnsafe<PayPalCheckout[]>(
    'SELECT * FROM PayPalBusinessCheckout WHERE orderId = ? LIMIT 1', orderId
  );
  if (!rows[0]) return { found: false };
  const result = await verifyCapturedPayPalCheckout(rows[0], origin, false);
  return { found: true, paid: result.paid };
}

export async function findPayPalRefundSource(organizationId: string, workflowId: string, submissionId: string) {
  await ensureTable();
  const rows = await paymentRow(organizationId, workflowId, submissionId);
  const row = rows[0];
  if (!row || row.status !== 'PAID' || !row.captureId) return null;
  return { provider: 'PAYPAL' as const, merchantId: row.merchantId, paymentId: row.captureId, amountCents: row.amountCents };
}
