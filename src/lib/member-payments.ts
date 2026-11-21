import { prisma } from './prisma';
import { stripeBusinessCheckoutPaid } from './business-checkout-verification';
import {
  createMembershipActivation,
  ensureWorkflowExecutionTables,
  getPublicWorkflow,
  getWorkflowSubmission,
} from './workflow-execution';
import { queueEmail } from './organization-ops';

type StripeAccount = {
  id: string;
  charges_enabled?: boolean;
  payouts_enabled?: boolean;
  details_submitted?: boolean;
};

type CheckoutSession = {
  id: string;
  url?: string | null;
  payment_status?: string;
  status?: string;
  mode?: string;
  metadata?: Record<string, string>;
  amount_total?: number | null;
  currency?: string | null;
  payment_intent?: string | { id?: string } | null;
};

let stripeReceiptTableReady: Promise<void> | null = null;
async function ensureStripeReceiptTable() {
  if (!stripeReceiptTableReady) {
    stripeReceiptTableReady = prisma.$executeRawUnsafe(
      "CREATE TABLE IF NOT EXISTS StripeBusinessCheckoutReceipt (" +
      "submissionId TEXT PRIMARY KEY NOT NULL, organizationId TEXT NOT NULL, workflowId TEXT NOT NULL, " +
      "sessionId TEXT NOT NULL UNIQUE, connectedAccountId TEXT NOT NULL, paymentIntentId TEXT NOT NULL, " +
      "amountCents INTEGER NOT NULL, createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"
    ).then(() => undefined).catch((error) => { stripeReceiptTableReady = null; throw error; });
  }
  return stripeReceiptTableReady;
}

async function recordStripeBusinessReceipt(
  session: CheckoutSession,
  connectedAccountId: string,
  input: { organizationId: string; workflowId: string; submissionId: string; amountCents: number },
) {
  // Recurring invoices have their own charge lifecycle. This table records
  // refundable one-time captures only, never a subscription's Checkout receipt.
  if (session.mode !== 'payment') return;
  const intent = typeof session.payment_intent === 'string'
    ? session.payment_intent : session.payment_intent?.id;
  if (!session.id || !intent) throw new Error('STRIPE_PAYMENT_INTENT_NOT_RECORDED');
  await ensureStripeReceiptTable();
  await prisma.$executeRawUnsafe(
    'INSERT INTO StripeBusinessCheckoutReceipt ' +
    '(submissionId, organizationId, workflowId, sessionId, connectedAccountId, paymentIntentId, amountCents) ' +
    'VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(submissionId) DO NOTHING',
    input.submissionId, input.organizationId, input.workflowId, session.id,
    connectedAccountId, intent, input.amountCents,
  );
  const rows = await prisma.$queryRawUnsafe<Array<{ sessionId: string; connectedAccountId: string; paymentIntentId: string; amountCents: number }>>(
    'SELECT sessionId, connectedAccountId, paymentIntentId, amountCents FROM StripeBusinessCheckoutReceipt ' +
    'WHERE organizationId = ? AND workflowId = ? AND submissionId = ? LIMIT 1',
    input.organizationId, input.workflowId, input.submissionId
  );
  const saved = rows[0];
  if (!saved || saved.sessionId !== session.id || saved.connectedAccountId !== connectedAccountId ||
      saved.paymentIntentId !== intent || saved.amountCents !== input.amountCents) {
    throw new Error('STRIPE_RECEIPT_RECORD_MISMATCH');
  }
}

export type OrganizationPaymentAccountRecord = {
  organizationId: string;
  provider: string;
  connectedAccountId: string | null;
  onboardingStatus: string;
  chargesEnabled: number;
  payoutsEnabled: number;
  detailsSubmitted: number;
  updatedAt: string;
};

let paymentTableReady: Promise<void> | null = null;

export function stripeConnectConfigured() {
  return Boolean(String(process.env.STRIPE_SECRET_KEY || '').trim());
}

async function stripeRequest<T>(
  path: string,
  init?: RequestInit,
  connectedAccountId?: string | null,
): Promise<T> {
  const secret = String(process.env.STRIPE_SECRET_KEY || '').trim();
  if (!secret) throw new Error('STRIPE_NOT_CONFIGURED');

  const response = await fetch(`https://api.stripe.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${secret}`,
      ...(connectedAccountId ? { 'Stripe-Account': connectedAccountId } : {}),
      ...(init?.body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
      ...(init?.headers || {}),
    },
  });

  const data = await response.json() as T & { error?: { message?: string } };
  if (!response.ok) {
    throw new Error(data.error?.message || `Stripe request failed with HTTP ${response.status}.`);
  }
  return data;
}

export async function ensureOrganizationPaymentTable() {
  if (!paymentTableReady) {
    paymentTableReady = (async () => {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS OrganizationPaymentAccount (
          organizationId TEXT PRIMARY KEY NOT NULL,
          provider TEXT NOT NULL DEFAULT 'STRIPE_CONNECT',
          connectedAccountId TEXT,
          onboardingStatus TEXT NOT NULL DEFAULT 'NOT_CONNECTED',
          chargesEnabled INTEGER NOT NULL DEFAULT 0,
          payoutsEnabled INTEGER NOT NULL DEFAULT 0,
          detailsSubmitted INTEGER NOT NULL DEFAULT 0,
          updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `);
    })().catch((error) => {
      paymentTableReady = null;
      throw error;
    });
  }
  return paymentTableReady;
}

export async function getOrganizationPaymentAccount(
  organizationId: string,
): Promise<OrganizationPaymentAccountRecord | null> {
  await ensureOrganizationPaymentTable();
  const rows = await prisma.$queryRawUnsafe<OrganizationPaymentAccountRecord[]>(
    `SELECT * FROM OrganizationPaymentAccount WHERE organizationId = ? LIMIT 1`,
    organizationId,
  );
  return rows[0] || null;
}

async function saveAccountSnapshot(
  organizationId: string,
  account: StripeAccount,
): Promise<OrganizationPaymentAccountRecord | null> {
  await ensureOrganizationPaymentTable();
  const chargesEnabled = account.charges_enabled ? 1 : 0;
  const payoutsEnabled = account.payouts_enabled ? 1 : 0;
  const detailsSubmitted = account.details_submitted ? 1 : 0;
  const onboardingStatus =
    chargesEnabled && payoutsEnabled
      ? 'READY'
      : detailsSubmitted
        ? 'RESTRICTED'
        : 'ONBOARDING';

  await prisma.$executeRawUnsafe(
    `INSERT INTO OrganizationPaymentAccount
      (organizationId, provider, connectedAccountId, onboardingStatus, chargesEnabled, payoutsEnabled, detailsSubmitted, updatedAt)
     VALUES (?, 'STRIPE_CONNECT', ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(organizationId) DO UPDATE SET
       connectedAccountId = excluded.connectedAccountId,
       onboardingStatus = excluded.onboardingStatus,
       chargesEnabled = excluded.chargesEnabled,
       payoutsEnabled = excluded.payoutsEnabled,
       detailsSubmitted = excluded.detailsSubmitted,
       updatedAt = CURRENT_TIMESTAMP`,
    organizationId,
    account.id,
    onboardingStatus,
    chargesEnabled,
    payoutsEnabled,
    detailsSubmitted,
  );

  return getOrganizationPaymentAccount(organizationId);
}

export async function refreshOrganizationPaymentAccount(
  organizationId: string,
): Promise<OrganizationPaymentAccountRecord | null> {
  const existing = await getOrganizationPaymentAccount(organizationId);
  if (!existing?.connectedAccountId || !stripeConnectConfigured()) return existing;

  const account = await stripeRequest<StripeAccount>(
    `/v1/accounts/${encodeURIComponent(existing.connectedAccountId)}`,
  );
  return saveAccountSnapshot(organizationId, account);
}

export async function createOrganizationPaymentOnboarding(input: {
  organizationId: string;
  organizationEmail: string;
  origin: string;
}) {
  if (!stripeConnectConfigured()) throw new Error('STRIPE_NOT_CONFIGURED');
  await ensureOrganizationPaymentTable();

  let state = await getOrganizationPaymentAccount(input.organizationId);
  let accountId = state?.connectedAccountId || null;

  if (!accountId) {
    const params = new URLSearchParams();
    params.set('type', 'express');
    params.set('country', 'US');
    params.set('email', input.organizationEmail);
    params.set('capabilities[card_payments][requested]', 'true');
    params.set('capabilities[transfers][requested]', 'true');
    params.set('metadata[organizationId]', input.organizationId);

    const account = await stripeRequest<StripeAccount>('/v1/accounts', {
      method: 'POST',
      body: params,
    });
    accountId = account.id;
    state = await saveAccountSnapshot(input.organizationId, account);
  }

  const links = new URLSearchParams();
  links.set('account', accountId);
  links.set('refresh_url', `${input.origin}/workspace/payments?connect=refresh`);
  links.set('return_url', `${input.origin}/workspace/payments?connect=return`);
  links.set('type', 'account_onboarding');

  const link = await stripeRequest<{ url: string }>('/v1/account_links', {
    method: 'POST',
    body: links,
  });

  return { url: link.url, state };
}

async function getPaymentWorkflow(workflowId: string, expectedOrganizationId?: string) {
  const rows = await prisma.$queryRawUnsafe<Array<{
    id: string;
    organizationId: string;
    kind: string;
    name: string;
    status: string;
    configJson: string;
  }>>(
    `SELECT id, organizationId, kind, name, status, configJson
     FROM WorkflowDefinition
     WHERE id = ?
     LIMIT 1`,
    workflowId,
  );

  const row = rows[0];
  if (!row || (row.kind !== 'MEMBERSHIP' && row.kind !== 'EVENT')) return null;
  if (expectedOrganizationId && row.organizationId !== expectedOrganizationId) return null;

  const organization = await prisma.organization.findUnique({
    where: { id: row.organizationId },
    select: { name: true },
  });
  if (!organization) return null;

  let config: Record<string, unknown> = {};
  try { config = JSON.parse(row.configJson || '{}'); } catch {}

  return {
    id: row.id,
    organizationId: row.organizationId,
    organizationName: organization.name,
    kind: row.kind as 'MEMBERSHIP' | 'EVENT',
    status: row.status,
    name: row.name,
    config,
  };
}

export async function createWorkflowPaymentCheckout(input: {
  workflowId: string;
  submissionId: string;
  origin: string;
}) {
  const workflow = await getPublicWorkflow(input.workflowId);
  if (!workflow) throw new Error('WORKFLOW_NOT_AVAILABLE');

  const submission = await getWorkflowSubmission(
    workflow.organizationId,
    workflow.id,
    input.submissionId,
  );
  if (!submission) throw new Error('SUBMISSION_NOT_FOUND');
  if (submission.amountCents <= 0) throw new Error('PAYMENT_NOT_REQUIRED');
  if (submission.paymentStatus !== 'PENDING') throw new Error('PAYMENT_NOT_ELIGIBLE_FOR_NEW_CHECKOUT');

  const paymentEligibleStatus =
    workflow.kind === 'EVENT'
      ? submission.status === 'PAYMENT_PENDING'
      : submission.status === 'PAYMENT_PENDING' || submission.status === 'PENDING_REVIEW';

  if (!paymentEligibleStatus) {
    throw new Error('SUBMISSION_NOT_ELIGIBLE_FOR_PAYMENT');
  }

  const { preferredBusinessCheckoutProvider } = await import('./business-payment-preferences');
  const provider = await preferredBusinessCheckoutProvider(workflow.organizationId);
  if (provider === 'SQUARE') {
    const { createSquareWorkflowCheckout } = await import('./square-workflow-checkout');
    return createSquareWorkflowCheckout({ workflow, submissionId: submission.id, origin: input.origin });
  }
  if (provider === 'PAYPAL') {
    const { createPayPalWorkflowCheckout } = await import('./paypal-workflow-checkout');
    return createPayPalWorkflowCheckout({ workflow, submissionId: submission.id, origin: input.origin });
  }

  const account = await refreshOrganizationPaymentAccount(workflow.organizationId);
  if (!account?.connectedAccountId || !Number(account.chargesEnabled)) {
    throw new Error('ORGANIZATION_PAYMENT_NOT_READY');
  }

  const params = new URLSearchParams();
  const cadence = String(workflow.config.billingCadence || 'ONE_TIME').toUpperCase();
  const recurringMembership =
    workflow.kind === 'MEMBERSHIP' && (cadence === 'MONTHLY' || cadence === 'YEARLY');

  params.set('mode', recurringMembership ? 'subscription' : 'payment');
  params.set('line_items[0][price_data][currency]', 'usd');
  params.set('line_items[0][price_data][unit_amount]', String(submission.amountCents));
  params.set('line_items[0][price_data][product_data][name]', workflow.name);
  if (recurringMembership) {
    params.set(
      'line_items[0][price_data][recurring][interval]',
      cadence === 'YEARLY' ? 'year' : 'month',
    );
  }
  params.set('line_items[0][quantity]', '1');
  params.set('customer_email', submission.email);
  params.set('metadata[icaFlowSubmissionId]', submission.id);
  params.set('metadata[organizationId]', workflow.organizationId);
  params.set('metadata[workflowId]', workflow.id);
  params.set('metadata[workflowKind]', workflow.kind);
  params.set(
    'success_url',
    `${input.origin}/flow/${workflow.id}/complete?session_id={CHECKOUT_SESSION_ID}&submission=${encodeURIComponent(submission.id)}`,
  );
  params.set(
    'cancel_url',
    `${input.origin}/flow/${workflow.id}?payment=cancelled`,
  );

  const session = await stripeRequest<CheckoutSession>(
    '/v1/checkout/sessions',
    { method: 'POST', body: params },
    account.connectedAccountId,
  );

  if (!session.id || !session.url) throw new Error('CHECKOUT_URL_MISSING');

  return {
    checkoutUrl: session.url,
    sessionId: session.id,
    connectedAccountId: account.connectedAccountId,
  };
}

async function finalizePaidWorkflow(input: {
  workflow: {
    id: string;
    organizationId: string;
    organizationName: string;
    kind: 'MEMBERSHIP' | 'EVENT';
    name: string;
    config: Record<string, unknown>;
  };
  submission: Awaited<ReturnType<typeof getWorkflowSubmission>> & {};
  checkoutSessionId: string;
  origin: string;
}) {
  const { workflow, submission } = input;
  if (!submission) throw new Error('SUBMISSION_NOT_FOUND');

  if (submission.paymentStatus === 'PAID') {
    return { paid: true, status: submission.status, activationUrl: null };
  }
  // A paid-then-refunded registration cannot be reactivated by delayed webhooks.
  if (submission.paymentStatus === 'REFUNDED') {
    return { paid: false, status: submission.status, activationUrl: null };
  }

  let nextStatus = submission.status;
  let activationUrl: string | null = null;

  if (workflow.kind === 'EVENT') {
    nextStatus = submission.status === 'WAITLISTED' ? 'WAITLISTED' : 'REGISTERED';
  } else {
    const approvalRequired = Boolean(workflow.config.approvalRequired);
    nextStatus = approvalRequired ? 'PENDING_REVIEW' : 'APPROVED';
  }

  await ensureWorkflowExecutionTables();
  // The conditional update claims the paid transition exactly once. Parallel
  // webhooks and browser returns must not generate duplicate activation links.
  const changed = await prisma.$executeRawUnsafe(
    `UPDATE WorkflowSubmission
     SET paymentStatus = 'PAID', status = ?, updatedAt = CURRENT_TIMESTAMP
     WHERE id = ? AND organizationId = ? AND workflowId = ?
       AND paymentStatus = 'PENDING'`,
    nextStatus,
    submission.id,
    workflow.organizationId,
    workflow.id,
  );
  if (changed !== 1) {
    const current = await getWorkflowSubmission(workflow.organizationId, workflow.id, submission.id);
    if (current?.paymentStatus === 'PAID') {
      return { paid: true, status: current.status, activationUrl: null };
    }
    throw new Error('WORKFLOW_PAYMENT_TRANSITION_FAILED');
  }

  if (workflow.kind === 'MEMBERSHIP' && !Boolean(workflow.config.approvalRequired)) {
    try {
      const activation = await createMembershipActivation({
        organizationId: workflow.organizationId,
        organizationName: workflow.organizationName,
        name: submission.name,
        email: submission.email,
        origin: input.origin,
      });
      activationUrl = activation.inviteUrl;
    } catch (error) {
      // Payment is already verified and persisted; never charge again to retry onboarding.
      console.error('ICA_PAID_MEMBERSHIP_ACTIVATION_REQUIRES_RETRY', error);
    }
  }

  try {
    await queueEmail({
      organizationId: workflow.organizationId,
      recipient: submission.email,
      templateKey: 'PAYMENT_RECEIPT',
      subject: `${workflow.name} · payment received`,
      bodyText: [
        `Hello ${submission.name},`,
        '',
        `Payment of $${(submission.amountCents / 100).toFixed(2)} was received for ${workflow.name}.`,
        `Status: ${nextStatus.replaceAll('_', ' ')}`,
        workflow.kind === 'EVENT' &&
        nextStatus === 'REGISTERED' &&
        typeof workflow.config.meetingLink === 'string' &&
        workflow.config.meetingLink.trim()
          ? `Event access: ${workflow.config.meetingLink.trim()}`
          : '',
        activationUrl ? `Activate your ICA Unified account: ${activationUrl}` : '',
        '',
        `${workflow.organizationName} · ICA Unified`,
      ].filter(Boolean).join('\n'),
      payload: {
        workflowId: workflow.id,
        submissionId: submission.id,
        checkoutSessionId: input.checkoutSessionId,
      },
    });
  } catch (error) {
    console.error('ICA_WORKFLOW_PAYMENT_EMAIL_ERROR', error);
  }

  return { paid: true, status: nextStatus, activationUrl };
}

/**
 * Invoked only after a processor's server-side payment proof is independently verified.
 * This function is not a public route and may not trust a browser success redirect.
 */
export async function finalizeVerifiedBusinessWorkflowPayment(input: {
  organizationId: string;
  workflowId: string;
  submissionId: string;
  receiptId: string;
  origin: string;
}) {
  const workflow = await getPaymentWorkflow(input.workflowId, input.organizationId);
  if (!workflow) throw new Error('WORKFLOW_NOT_AVAILABLE');
  const submission = await getWorkflowSubmission(input.organizationId, input.workflowId, input.submissionId);
  if (!submission) throw new Error('SUBMISSION_NOT_FOUND');
  return finalizePaidWorkflow({
    workflow,
    submission,
    checkoutSessionId: input.receiptId,
    origin: input.origin,
  });
}

export async function confirmWorkflowPayment(input: {
  workflowId: string;
  submissionId: string;
  sessionId: string;
  origin: string;
}) {
  const workflow = await getPaymentWorkflow(input.workflowId);
  if (!workflow) throw new Error('WORKFLOW_NOT_AVAILABLE');

  const submission = await getWorkflowSubmission(
    workflow.organizationId,
    workflow.id,
    input.submissionId,
  );
  if (!submission) throw new Error('SUBMISSION_NOT_FOUND');

  const account = await getOrganizationPaymentAccount(workflow.organizationId);
  if (!account?.connectedAccountId) throw new Error('ORGANIZATION_PAYMENT_NOT_READY');

  const session = await stripeRequest<CheckoutSession>(
    `/v1/checkout/sessions/${encodeURIComponent(input.sessionId)}`,
    undefined,
    account.connectedAccountId,
  );

  // A checkout success URL alone never grants membership/event access.
  // The provider's completed AND paid status, amount, currency and tenant
  // metadata must all match, including recurring memberships.
  const paid = stripeBusinessCheckoutPaid(session, {
    organizationId: workflow.organizationId,
    workflowId: workflow.id,
    submissionId: submission.id,
    amountCents: submission.amountCents,
  });

  if (!paid) {
    return { paid: false, status: submission.status, activationUrl: null };
  }
  await recordStripeBusinessReceipt(session, account.connectedAccountId, {
    organizationId: workflow.organizationId,
    workflowId: workflow.id,
    submissionId: submission.id,
    amountCents: submission.amountCents,
  });

  return finalizePaidWorkflow({
    workflow,
    submission,
    checkoutSessionId: session.id,
    origin: input.origin,
  });
}

export async function handleWorkflowPaymentWebhook(event: {
  type?: string;
  account?: string;
  data?: { object?: unknown };
}) {
  const type = String(event.type || '');
  if (!['checkout.session.completed', 'checkout.session.async_payment_succeeded'].includes(type)) {
    return false;
  }

  const session = event.data?.object as CheckoutSession | undefined;
  if (!session) return false;
  const metadata = session.metadata;
  const workflowId = String(metadata?.workflowId || '');
  const submissionId = String(metadata?.icaFlowSubmissionId || '');
  const organizationId = String(metadata?.organizationId || '');

  if (!workflowId || !submissionId || !organizationId) return false;

  const workflow = await getPaymentWorkflow(workflowId, organizationId);
  if (!workflow) throw new Error('WORKFLOW_NOT_AVAILABLE');

  const submission = await getWorkflowSubmission(
    organizationId,
    workflowId,
    submissionId,
  );
  if (!submission) throw new Error('SUBMISSION_NOT_FOUND');

  const account = await getOrganizationPaymentAccount(organizationId);
  if (!account?.connectedAccountId) throw new Error('ORGANIZATION_PAYMENT_NOT_READY');
  // Business payments must originate on the exact connected account.
  // A platform-level Stripe event is not a business-payment receipt.
  if (!event.account || event.account !== account.connectedAccountId) {
    throw new Error('CONNECTED_ACCOUNT_MISMATCH');
  }

  const paid = stripeBusinessCheckoutPaid(session, {
    organizationId,
    workflowId,
    submissionId,
    amountCents: submission.amountCents,
  });

  if (!paid) return true;
  // Webhook payloads can omit expanded intent fields. Fetch the canonical
  // Checkout Session when necessary to record a refundable one-time receipt.
  const canonicalSession = session.mode === 'payment' && !session.payment_intent
    ? await stripeRequest<CheckoutSession>(
        '/v1/checkout/sessions/' + encodeURIComponent(session.id),
        undefined, account.connectedAccountId,
      )
    : session;
  if (!stripeBusinessCheckoutPaid(canonicalSession, {
    organizationId, workflowId, submissionId, amountCents: submission.amountCents,
  })) throw new Error('STRIPE_RECEIPT_VERIFICATION_FAILED');
  await recordStripeBusinessReceipt(canonicalSession, account.connectedAccountId, {
    organizationId, workflowId, submissionId, amountCents: submission.amountCents,
  });

  await finalizePaidWorkflow({
    workflow,
    submission,
    checkoutSessionId: session.id,
    origin: String(
      process.env.NEXT_PUBLIC_APP_URL ||
      process.env.APP_BASE_URL ||
      'https://unified.icomputeranything.com'
    ).trim(),
  });

  return true;
}

export async function findStripeRefundSource(organizationId: string, workflowId: string, submissionId: string) {
  await ensureStripeReceiptTable();
  const rows = await prisma.$queryRawUnsafe<Array<{
    connectedAccountId: string; paymentIntentId: string; amountCents: number;
  }>>(
    'SELECT connectedAccountId, paymentIntentId, amountCents FROM StripeBusinessCheckoutReceipt ' +
    'WHERE organizationId = ? AND workflowId = ? AND submissionId = ? LIMIT 1',
    organizationId, workflowId, submissionId,
  );
  const row = rows[0];
  if (!row) return null;
  return { provider: 'STRIPE' as const, merchantId: row.connectedAccountId,
    paymentId: row.paymentIntentId, amountCents: row.amountCents };
}

export async function issueStripeBusinessRefund(input: {
  connectedAccountId: string; paymentIntentId: string; idempotencyKey: string;
}) {
  const body = new URLSearchParams({ payment_intent: input.paymentIntentId });
  const refund = await stripeRequest<{
    id?: string; payment_intent?: string; status?: string; amount?: number; currency?: string;
  }>('/v1/refunds', {
    method: 'POST', body,
    headers: { 'Idempotency-Key': input.idempotencyKey },
  }, input.connectedAccountId);
  if (!refund.id || refund.payment_intent !== input.paymentIntentId ||
      refund.currency !== 'usd') throw new Error('STRIPE_REFUND_RESPONSE_INVALID');
  return refund;
}

export async function readStripeBusinessRefund(input: {
  connectedAccountId: string; refundId: string;
}) {
  return stripeRequest<{ id?: string; payment_intent?: string; status?: string;
    amount?: number; currency?: string }>(
    '/v1/refunds/' + encodeURIComponent(input.refundId),
    undefined, input.connectedAccountId
  );
}
