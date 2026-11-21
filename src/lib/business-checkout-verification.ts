/**
 * A successful redirect or Checkout Session "complete" event is not evidence
 * that any merchant received money. This verifier is shared by the browser
 * return and Stripe's signed Connect webhook.
 */
export type VerifiedStripeCheckoutSession = {
  id?: string;
  mode?: string;
  status?: string;
  payment_status?: string;
  currency?: string | null;
  amount_total?: number | null;
  metadata?: Record<string, string>;
};

export type StripeWorkflowReceipt = {
  organizationId: string;
  workflowId: string;
  submissionId: string;
  amountCents: number;
};

export function stripeBusinessCheckoutPaid(
  session: VerifiedStripeCheckoutSession,
  expected: StripeWorkflowReceipt,
): boolean {
  const metadata = session.metadata;
  if (
    !session.id ||
    (session.mode !== 'payment' && session.mode !== 'subscription') ||
    session.status !== 'complete' ||
    session.currency?.toLowerCase() !== 'usd' ||
    !Number.isSafeInteger(expected.amountCents) || expected.amountCents <= 0 ||
    !Number.isSafeInteger(session.amount_total) ||
    session.amount_total !== expected.amountCents ||
    metadata?.organizationId !== expected.organizationId ||
    metadata?.workflowId !== expected.workflowId ||
    metadata?.icaFlowSubmissionId !== expected.submissionId
  ) {
    return false;
  }
  return session.payment_status === 'paid';
}
