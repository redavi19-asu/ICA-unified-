import { createHash, randomUUID } from 'node:crypto';
import { prisma } from './prisma';
import { getWorkflowSubmission } from './workflow-execution';
import { squareMerchantApi, getSquareMerchantStatus, squareConfig } from './square-connect';
import { getPayPalMerchantStatus, paypalPartnerConfig, paypalPartnerApi } from './paypal-connect';
import {
  findStripeRefundSource, issueStripeBusinessRefund, readStripeBusinessRefund,
} from './member-payments';
import { findSquareRefundSource } from './square-workflow-checkout';
import { findPayPalRefundSource } from './paypal-workflow-checkout';

export type BusinessRefundProvider = 'STRIPE' | 'SQUARE' | 'PAYPAL';
export type RefundState = 'IN_FLIGHT' | 'PENDING' | 'COMPLETED' | 'FAILED';
type Source = {
  provider: BusinessRefundProvider;
  merchantId: string;
  paymentId: string;
  amountCents: number;
};
type RefundRow = Source & {
  id: string;
  organizationId: string;
  workflowId: string;
  submissionId: string;
  refundId: string | null;
  state: RefundState;
  leaseUntilMs: number;
};

let tableReady: Promise<void> | null = null;

async function ensureRefundTable() {
  if (!tableReady) {
    tableReady = prisma.$executeRawUnsafe(
      'CREATE TABLE IF NOT EXISTS BusinessPaymentRefund (' +
      'id TEXT PRIMARY KEY NOT NULL, organizationId TEXT NOT NULL, workflowId TEXT NOT NULL, ' +
      'submissionId TEXT NOT NULL UNIQUE, provider TEXT NOT NULL, merchantId TEXT NOT NULL, ' +
      'paymentId TEXT NOT NULL, amountCents INTEGER NOT NULL, refundId TEXT, ' +
      'state TEXT NOT NULL DEFAULT \'IN_FLIGHT\', leaseUntilMs INTEGER NOT NULL DEFAULT 0, ' +
      'createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)'
    ).then(() => undefined).catch((error) => { tableReady = null; throw error; });
  }
  return tableReady;
}

export function businessRefundsEnabled() {
  return process.env.BUSINESS_REFUNDS_ENABLED === 'true' &&
    (process.env.NODE_ENV !== 'production' ||
      process.env.BUSINESS_REFUNDS_PRODUCTION_APPROVED === 'true');
}

export function stableRefundIdempotencyKey(input: {
  organizationId: string; workflowId: string; submissionId: string;
}) {
  return 'ica-' + createHash('sha256')
    .update(input.organizationId + ':' + input.workflowId + ':' + input.submissionId)
    .digest('hex').slice(0, 32);
}

/** Refund only from the original verified merchant transaction, never current defaults. */
async function findOriginalMerchantSource(
  organizationId: string, workflowId: string, submissionId: string,
): Promise<Source> {
  const choices = await Promise.all([
    findStripeRefundSource(organizationId, workflowId, submissionId),
    findSquareRefundSource(organizationId, workflowId, submissionId),
    findPayPalRefundSource(organizationId, workflowId, submissionId),
  ]);
  const found = choices.filter((row): row is NonNullable<typeof row> => Boolean(row));
  if (found.length !== 1) throw new Error('BUSINESS_ORIGINAL_PAYMENT_UNAVAILABLE');
  return found[0];
}

function refundQuery(organizationId: string, workflowId: string, submissionId: string) {
  return prisma.$queryRawUnsafe<RefundRow[]>(
    'SELECT id, organizationId, workflowId, submissionId, provider, merchantId, paymentId, ' +
    'amountCents, refundId, state, leaseUntilMs FROM BusinessPaymentRefund ' +
    'WHERE organizationId = ? AND workflowId = ? AND submissionId = ? LIMIT 1',
    organizationId, workflowId, submissionId,
  );
}

export type RefundResult = {
  provider: BusinessRefundProvider;
  amountCents: number;
  state: RefundState;
};

function asRefundResult(row: RefundRow): RefundResult {
  return { provider: row.provider, amountCents: Number(row.amountCents), state: row.state };
}

export async function listBusinessRefunds(organizationId: string): Promise<Array<{
  submissionId: string; workflowId: string; provider: string; amountCents: number; state: RefundState;
}>> {
  await ensureRefundTable();
  return prisma.$queryRawUnsafe<Array<{
    submissionId: string; workflowId: string; provider: string; amountCents: number; state: RefundState;
  }>>(
    'SELECT submissionId, workflowId, provider, amountCents, state FROM BusinessPaymentRefund ' +
    'WHERE organizationId = ? ORDER BY datetime(createdAt) DESC LIMIT 80',
    organizationId,
  );
}

export async function requestFullBusinessRefund(input: {
  organizationId: string; workflowId: string; submissionId: string;
}): Promise<RefundResult> {
  if (!businessRefundsEnabled()) throw new Error('BUSINESS_REFUNDS_DISABLED');
  await ensureRefundTable();
  const submission = await getWorkflowSubmission(input.organizationId, input.workflowId, input.submissionId);
  if (!submission) throw new Error('BUSINESS_PAYMENT_NOT_FOUND');

  const existing = (await refundQuery(input.organizationId, input.workflowId, input.submissionId))[0];
  if (existing?.state === 'COMPLETED' || existing?.state === 'PENDING') {
    if (existing.state === 'COMPLETED') {
      await markBusinessRefundCompleted(input);
      return asRefundResult(existing);
    }
    return reconcileBusinessRefund(input);
  }
  if (submission.paymentStatus !== 'PAID') throw new Error('BUSINESS_PAYMENT_NOT_REFUNDABLE');

  const source = await findOriginalMerchantSource(input.organizationId, input.workflowId, input.submissionId);
  if (source.amountCents !== submission.amountCents || source.amountCents < 1) {
    throw new Error('BUSINESS_REFUND_AMOUNT_MISMATCH');
  }

  const now = Date.now();
  const recordId = randomUUID();
  const inserted = await prisma.$executeRawUnsafe(
    'INSERT INTO BusinessPaymentRefund ' +
    '(id, organizationId, workflowId, submissionId, provider, merchantId, paymentId, amountCents, state, leaseUntilMs) ' +
    'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(submissionId) DO NOTHING',
    recordId, input.organizationId, input.workflowId, input.submissionId, source.provider,
    source.merchantId, source.paymentId, source.amountCents, 'IN_FLIGHT', now + 120_000,
  );
  const row = (await refundQuery(input.organizationId, input.workflowId, input.submissionId))[0];
  if (!row || row.provider !== source.provider || row.merchantId !== source.merchantId ||
      row.paymentId !== source.paymentId || row.amountCents !== source.amountCents) {
    throw new Error('BUSINESS_REFUND_RECORD_CONFLICT');
  }
  let claim = inserted === 1;
  if (!claim && (row.state === 'FAILED' || (row.state === 'IN_FLIGHT' && row.leaseUntilMs < now))) {
    const updated = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
      'UPDATE BusinessPaymentRefund SET state = ?, leaseUntilMs = ?, updatedAt = CURRENT_TIMESTAMP ' +
      'WHERE id = ? AND organizationId = ? AND (state = ? OR (state = ? AND leaseUntilMs < ?)) RETURNING id',
      'IN_FLIGHT', now + 120_000, row.id, input.organizationId,
      'FAILED', 'IN_FLIGHT', now,
    );
    claim = updated.length === 1;
  }
  if (!claim) return asRefundResult(row);

  const idempotencyKey = stableRefundIdempotencyKey(input);
  try {
    const providerResult = await startProviderRefund(source, input.organizationId, idempotencyKey);
    if (!providerResult.refundId) throw new Error('BUSINESS_REFUND_NO_PROVIDER_REFERENCE');
    if (providerResult.amountCents !== source.amountCents) throw new Error('BUSINESS_REFUND_RESPONSE_AMOUNT_MISMATCH');
    const state = providerResult.state;
    await prisma.$executeRawUnsafe(
      'UPDATE BusinessPaymentRefund SET refundId = ?, state = ?, leaseUntilMs = 0, updatedAt = CURRENT_TIMESTAMP ' +
      'WHERE id = ? AND organizationId = ?',
      providerResult.refundId, state, row.id, input.organizationId,
    );
    if (state === 'COMPLETED') await markBusinessRefundCompleted(input);
    return { provider: source.provider, amountCents: source.amountCents, state };
  } catch (error) {
    await prisma.$executeRawUnsafe(
      'UPDATE BusinessPaymentRefund SET state = ?, leaseUntilMs = 0, updatedAt = CURRENT_TIMESTAMP ' +
      'WHERE id = ? AND organizationId = ? AND state = ?',
      'FAILED', row.id, input.organizationId, 'IN_FLIGHT',
    );
    throw error;
  }
}

async function startProviderRefund(source: Source, organizationId: string, idempotencyKey: string):
  Promise<{ refundId: string; amountCents: number; state: RefundState }> {
  if (source.provider === 'SQUARE') {
    const connected = await getSquareMerchantStatus(organizationId);
    if (!connected || connected.merchantId !== source.merchantId || connected.mode !== squareConfig().mode) {
      throw new Error('BUSINESS_SQUARE_MERCHANT_MISMATCH');
    }
    const result = await squareMerchantApi<{ refund?: {
      id?: string; payment_id?: string; status?: string;
      amount_money?: { amount?: number; currency?: string };
    } }>(organizationId, '/v2/refunds', {
      method: 'POST',
      body: {
        idempotency_key: idempotencyKey,
        payment_id: source.paymentId,
        amount_money: { amount: source.amountCents, currency: 'USD' },
        reason: 'Full refund requested by business',
      },
    });
    const item = result.refund;
    if (!item?.id || item.payment_id !== source.paymentId || item.amount_money?.currency !== 'USD' ||
        item.amount_money.amount !== source.amountCents) throw new Error('SQUARE_REFUND_RESPONSE_INVALID');
    return { refundId: item.id, amountCents: source.amountCents,
      state: item.status === 'COMPLETED' ? 'COMPLETED' : item.status === 'PENDING' ? 'PENDING' : 'FAILED' };
  }
  if (source.provider === 'PAYPAL') {
    const rows = await prisma.$queryRawUnsafe<Array<{ organizationId: string }>>(
      'SELECT organizationId FROM PayPalBusinessCheckout WHERE organizationId = ? ' +
      'AND merchantId = ? AND captureId = ? AND status = ? LIMIT 1',
      organizationId, source.merchantId, source.paymentId, 'PAID',
    );
    if (!rows[0]) throw new Error('BUSINESS_PAYPAL_MERCHANT_MISMATCH');
    const connected = await getPayPalMerchantStatus(organizationId);
    if (connected.connectionStatus !== 'CONNECTED' || connected.merchantId !== source.merchantId ||
        connected.environment !== paypalPartnerConfig().environment) {
      throw new Error('BUSINESS_PAYPAL_MERCHANT_NOT_CONNECTED');
    }
    const result = await paypalPartnerApi<{ id?: string; status?: string; amount?: {
      value?: string; currency_code?: string;
    } }>('/v2/payments/captures/' + encodeURIComponent(source.paymentId) + '/refund', {
      method: 'POST', merchantId: source.merchantId, requestId: idempotencyKey,
      preferRepresentation: true, body: {},
    });
    if (!result.id) throw new Error('PAYPAL_REFUND_RESPONSE_INVALID');
    const { paypalAmountCents } = await import('./paypal-workflow-checkout');
    if (result.amount?.currency_code !== 'USD' ||
        paypalAmountCents(result.amount.value) !== source.amountCents) {
      throw new Error('PAYPAL_REFUND_RESPONSE_AMOUNT_MISMATCH');
    }
    return { refundId: result.id, amountCents: source.amountCents,
      state: result.status === 'COMPLETED' ? 'COMPLETED' : result.status === 'PENDING' ? 'PENDING' : 'FAILED' };
  }
  const result = await issueStripeBusinessRefund({
    connectedAccountId: source.merchantId, paymentIntentId: source.paymentId, idempotencyKey,
  });
  if (result.amount !== source.amountCents) throw new Error('STRIPE_REFUND_RESPONSE_AMOUNT_MISMATCH');
  return { refundId: result.id!, amountCents: source.amountCents,
    state: result.status === 'succeeded' ? 'COMPLETED' : result.status === 'pending' ? 'PENDING' : 'FAILED' };
}

async function markBusinessRefundCompleted(input: {
  organizationId: string; workflowId: string; submissionId: string;
}) {
  // A complete refund revokes paid-event access and membership eligibility.
  // Only the originally verified paid submission can be transitioned.
  const changed = await prisma.$executeRawUnsafe(
    'UPDATE WorkflowSubmission SET paymentStatus = ?, status = ?, updatedAt = CURRENT_TIMESTAMP ' +
    'WHERE id = ? AND organizationId = ? AND workflowId = ? AND paymentStatus = ?',
    'REFUNDED', 'CANCELLED', input.submissionId, input.organizationId, input.workflowId, 'PAID',
  );
  if (changed !== 1) {
    const submission = await getWorkflowSubmission(input.organizationId, input.workflowId, input.submissionId);
    if (submission?.paymentStatus !== 'REFUNDED') throw new Error('BUSINESS_REFUND_ACCESS_RECONCILIATION_FAILED');
  }
}

export async function reconcileBusinessRefund(input: {
  organizationId: string; workflowId: string; submissionId: string;
}): Promise<RefundResult> {
  await ensureRefundTable();
  const row = (await refundQuery(input.organizationId, input.workflowId, input.submissionId))[0];
  if (!row) throw new Error('BUSINESS_REFUND_NOT_FOUND');
  if (row.state === 'COMPLETED') {
    await markBusinessRefundCompleted(input);
    return asRefundResult(row);
  }
  if (row.state === 'FAILED' || !row.refundId) return asRefundResult(row);

  const result = await readProviderRefundStatus(row);
  if (result.refundId !== row.refundId || result.amountCents !== row.amountCents) {
    throw new Error('BUSINESS_REFUND_RECONCILIATION_MISMATCH');
  }
  await prisma.$executeRawUnsafe(
    'UPDATE BusinessPaymentRefund SET state = ?, updatedAt = CURRENT_TIMESTAMP ' +
    'WHERE id = ? AND organizationId = ? AND refundId = ?',
    result.state, row.id, input.organizationId, row.refundId,
  );
  if (result.state === 'COMPLETED') await markBusinessRefundCompleted(input);
  return { provider: row.provider, amountCents: row.amountCents, state: result.state };
}

async function readProviderRefundStatus(row: RefundRow): Promise<{
  refundId: string; amountCents: number; state: RefundState;
}> {
  if (row.provider === 'SQUARE') {
    const connected = await getSquareMerchantStatus(row.organizationId);
    if (!connected || connected.merchantId !== row.merchantId ||
        connected.mode !== squareConfig().mode) throw new Error('SQUARE_REFUND_MERCHANT_CHANGED');
    const result = await squareMerchantApi<{ refund?: {
      id?: string; payment_id?: string; status?: string;
      amount_money?: { amount?: number; currency?: string };
    } }>(row.organizationId, '/v2/refunds/' + encodeURIComponent(row.refundId!), {});
    const refund = result.refund;
    if (!refund?.id || refund.payment_id !== row.paymentId || refund.amount_money?.currency !== 'USD') {
      throw new Error('SQUARE_REFUND_MISMATCH');
    }
    return { refundId: refund.id, amountCents: refund.amount_money.amount!,
      state: refund.status === 'COMPLETED' ? 'COMPLETED' : refund.status === 'PENDING' ? 'PENDING' : 'FAILED' };
  }
  if (row.provider === 'PAYPAL') {
    const connected = await getPayPalMerchantStatus(row.organizationId);
    if (connected.merchantId !== row.merchantId || connected.environment !== paypalPartnerConfig().environment) {
      throw new Error('PAYPAL_REFUND_MERCHANT_CHANGED');
    }
    const refund = await paypalPartnerApi<{ id?: string; status?: string;
      amount?: { currency_code?: string; value?: string } }>(
      '/v2/payments/refunds/' + encodeURIComponent(row.refundId!),
      { merchantId: row.merchantId },
    );
    const { paypalAmountCents } = await import('./paypal-workflow-checkout');
    if (!refund.id || refund.amount?.currency_code !== 'USD') throw new Error('PAYPAL_REFUND_MISMATCH');
    const amountCents = paypalAmountCents(refund.amount.value);
    if (amountCents === null) throw new Error('PAYPAL_REFUND_AMOUNT_MISMATCH');
    return { refundId: refund.id, amountCents,
      state: refund.status === 'COMPLETED' ? 'COMPLETED' : refund.status === 'PENDING' ? 'PENDING' : 'FAILED' };
  }
  const refund = await readStripeBusinessRefund({
    connectedAccountId: row.merchantId, refundId: row.refundId!,
  });
  if (!refund.id || refund.payment_intent !== row.paymentId ||
      refund.currency !== 'usd' || typeof refund.amount !== 'number') {
    throw new Error('STRIPE_REFUND_MISMATCH');
  }
  return { refundId: refund.id, amountCents: refund.amount,
    state: refund.status === 'succeeded' ? 'COMPLETED' : refund.status === 'pending' ? 'PENDING' : 'FAILED' };
}
