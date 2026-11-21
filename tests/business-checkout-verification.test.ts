import assert from 'node:assert/strict';
import test from 'node:test';
import { stripeBusinessCheckoutPaid } from '../src/lib/business-checkout-verification';

const receipt = {
  organizationId: 'company-a',
  workflowId: 'event-one',
  submissionId: 'submission-one',
  amountCents: 2999,
};
const paid = {
  id: 'cs_test_business',
  mode: 'payment',
  status: 'complete',
  payment_status: 'paid',
  amount_total: 2999,
  currency: 'usd',
  metadata: {
    organizationId: 'company-a',
    workflowId: 'event-one',
    icaFlowSubmissionId: 'submission-one',
  },
};
test('only a completed paid session for exactly the right business, checkout and amount is accepted', () => {
  assert.equal(stripeBusinessCheckoutPaid(paid, receipt), true);
  assert.equal(stripeBusinessCheckoutPaid({ ...paid, mode: 'subscription' }, receipt), true);
  const invalid = [
    { ...paid, id: '' },
    { ...paid, status: 'open' },
    { ...paid, payment_status: 'unpaid' },
    { ...paid, payment_status: 'no_payment_required' },
    { ...paid, payment_status: undefined },
    { ...paid, amount_total: undefined },
    { ...paid, amount_total: 1 },
    { ...paid, currency: 'eur' },
    { ...paid, currency: null },
    { ...paid, mode: 'setup' },
    { ...paid, metadata: { ...paid.metadata, organizationId: 'company-b' } },
    { ...paid, metadata: { ...paid.metadata, workflowId: 'different-event' } },
    { ...paid, metadata: { ...paid.metadata, icaFlowSubmissionId: 'different-buyer' } },
    { ...paid, metadata: undefined },
  ];
  for (const invalidSession of invalid) {
    assert.equal(stripeBusinessCheckoutPaid(invalidSession, receipt), false, JSON.stringify(invalidSession));
  }
});
