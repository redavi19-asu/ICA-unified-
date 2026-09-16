import { prisma } from './prisma';
import {
  createMembershipActivation,
  ensureWorkflowExecutionTables,
  getPublicWorkflow,
  getWorkflowSubmission,
  setWorkflowSubmissionStatus,
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

export async function getOrganizationPaymentAccount(organizationId: string) {
  await ensureOrganizationPaymentTable();
  const rows = await prisma.$queryRawUnsafe<Array<{
    organizationId: string;
    provider: string;
    connectedAccountId: string | null;
    onboardingStatus: string;
    chargesEnabled: number;
    payoutsEnabled: number;
    detailsSubmitted: number;
    updatedAt: string;
  }>>(
    `SELECT * FROM OrganizationPaymentAccount WHERE organizationId = ? LIMIT 1`,
    organizationId,
  );
  return rows[0] || null;
}

async function saveAccountSnapshot(organizationId: string, account: StripeAccount) {
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

  return {
    connectedAccountId: account.id,
    onboardingStatus,
    chargesEnabled: Boolean(chargesEnabled),
    payoutsEnabled: Boolean(payoutsEnabled),
    detailsSubmitted: Boolean(detailsSubmitted),
  };
}

export async function refreshOrganizationPaymentAccount(organizationId: string) {
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
  links.set('refresh_url', `${input.origin}/workspace/billing?connect=refresh`);
  links.set('return_url', `${input.origin}/workspace/billing?connect=return`);
  links.set('type', 'account_onboarding');

  const link = await stripeRequest<{ url: string }>('/v1/account_links', {
    method: 'POST',
    body: links,
  });

  return { url: link.url, state };
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

export async function confirmWorkflowPayment(input: {
  workflowId: string;
  submissionId: string;
  sessionId: string;
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

  const account = await getOrganizationPaymentAccount(workflow.organizationId);
  if (!account?.connectedAccountId) throw new Error('ORGANIZATION_PAYMENT_NOT_READY');

  const session = await stripeRequest<CheckoutSession>(
    `/v1/checkout/sessions/${encodeURIComponent(input.sessionId)}`,
    undefined,
    account.connectedAccountId,
  );

  if (
    session.metadata?.icaFlowSubmissionId !== submission.id ||
    session.metadata?.workflowId !== workflow.id ||
    session.metadata?.organizationId !== workflow.organizationId
  ) {
    throw new Error('CHECKOUT_SESSION_MISMATCH');
  }

  const paid =
    session.mode === 'subscription'
      ? session.status === 'complete'
      : session.payment_status === 'paid';

  if (!paid) {
    return { paid: false, status: submission.status, activationUrl: null };
  }

  await ensureWorkflowExecutionTables();
  await prisma.$executeRawUnsafe(
    `UPDATE WorkflowSubmission
     SET paymentStatus = 'PAID', updatedAt = CURRENT_TIMESTAMP
     WHERE id = ? AND organizationId = ? AND workflowId = ?`,
    submission.id,
    workflow.organizationId,
    workflow.id,
  );

  let nextStatus = submission.status;
  let activationUrl: string | null = null;

  if (workflow.kind === 'EVENT') {
    nextStatus = submission.status === 'WAITLISTED' ? 'WAITLISTED' : 'REGISTERED';
  } else {
    const approvalRequired = Boolean(workflow.config.approvalRequired);
    nextStatus = approvalRequired ? 'PENDING_REVIEW' : 'APPROVED';
    if (!approvalRequired) {
      const activation = await createMembershipActivation({
        organizationId: workflow.organizationId,
        organizationName: workflow.organizationName,
        name: submission.name,
        email: submission.email,
        origin: input.origin,
      });
      activationUrl = activation.inviteUrl;
    }
  }

  await setWorkflowSubmissionStatus(
    workflow.organizationId,
    workflow.id,
    submission.id,
    nextStatus,
  );

  try {
    await queueEmail({
      organizationId: workflow.organizationId,
      recipient: submission.email,
      templateKey: 'PAYMENT_RECEIPT',
      subject: `${workflow.name} · payment received`,
      bodyText: [
        `Hello ${submission.name},`,
        '',
        `Payment of ${(submission.amountCents / 100).toFixed(2)} was received for ${workflow.name}.`,
        `Status: ${nextStatus.replaceAll('_', ' ')}`,
        workflow.kind === 'EVENT' && nextStatus === 'REGISTERED' && typeof workflow.config.meetingLink === 'string' && workflow.config.meetingLink.trim()
          ? `Event access: ${workflow.config.meetingLink.trim()}`
          : '',
        activationUrl ? `Activate your ICA Unified account: ${activationUrl}` : '',
        '',
        `${workflow.organizationName} · ICA Unified`,
      ].filter(Boolean).join('\n'),
      payload: {
        workflowId: workflow.id,
        submissionId: submission.id,
        checkoutSessionId: session.id,
      },
    });
  } catch (error) {
    console.error('ICA_WORKFLOW_PAYMENT_EMAIL_ERROR', error);
  }

  return { paid: true, status: nextStatus, activationUrl };
}
