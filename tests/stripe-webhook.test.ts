import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';
import { verifyStripeWebhookSignature } from '../src/lib/stripe-billing';

test('Stripe webhook verification rejects altered bodies, stale requests and forged signatures', () => {
  const previous = process.env.STRIPE_WEBHOOK_SECRET;
  const secret = 'whsec_synthetic_local_qc_only';
  process.env.STRIPE_WEBHOOK_SECRET = secret;
  const body = JSON.stringify({ id: 'evt_test', type: 'customer.subscription.updated' });
  const now = Math.floor(Date.now() / 1000);
  const sign = (timestamp: number) => `t=${timestamp},v1=${createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex')}`;
  try {
    assert.equal(verifyStripeWebhookSignature(body, sign(now)), true);
    assert.equal(verifyStripeWebhookSignature(body + ' ', sign(now)), false);
    assert.equal(verifyStripeWebhookSignature(body, sign(now - 600)), false);
    assert.equal(verifyStripeWebhookSignature(body, sign(now + 600)), false);
    assert.equal(verifyStripeWebhookSignature(body, `t=${now},v1=${'0'.repeat(64)}`), false);
    assert.equal(verifyStripeWebhookSignature(body, ''), false);
    assert.equal(verifyStripeWebhookSignature(body, `t=invalid,v1=${'0'.repeat(64)}`), false);
    assert.equal(verifyStripeWebhookSignature(body, `t=${now},v1=${'0'.repeat(64)},${sign(now).split(',')[1]}`), true);
  } finally {
    if (previous === undefined) delete process.env.STRIPE_WEBHOOK_SECRET;
    else process.env.STRIPE_WEBHOOK_SECRET = previous;
  }
});
