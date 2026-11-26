import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { test } from 'node:test';
import { POST } from '../src/app/api/billing/connect-webhook/route';

test('Connect webhooks require their own signature and ignore out-of-scope events', async () => {
  const previousConnect = process.env.STRIPE_CONNECT_WEBHOOK_SECRET;
  const previousBilling = process.env.STRIPE_WEBHOOK_SECRET;
  const previousKey = process.env.STRIPE_SECRET_KEY;
  const connectSecret = 'whsec_connect_fixture';
  const billingSecret = 'whsec_billing_fixture';
  process.env.STRIPE_CONNECT_WEBHOOK_SECRET = connectSecret;
  process.env.STRIPE_WEBHOOK_SECRET = billingSecret;
  process.env.STRIPE_SECRET_KEY = 'rk_live_fixture';

  function deliver(event: object, secret = connectSecret) {
    const body = JSON.stringify(event);
    const time = Math.floor(Date.now() / 1000);
    const signature = createHmac('sha256', secret).update(`${time}.${body}`).digest('hex');
    return POST(new Request('https://example.invalid/api/billing/connect-webhook', {
      method: 'POST',
      headers: { 'stripe-signature': `t=${time},v1=${signature}` },
      body,
    }));
  }

  const event = {
    type: 'checkout.session.async_payment_succeeded',
    account: 'acct_fixture',
    livemode: true,
    data: { object: { metadata: {
      workflowId: 'fixture',
      icaFlowSubmissionId: 'fixture',
      organizationId: 'fixture',
    } } },
  };

  try {
    assert.equal((await deliver(event, billingSecret)).status, 400);
    assert.equal((await deliver({ ...event, livemode: false })).status, 200);
    assert.equal((await deliver({ ...event, account: undefined })).status, 200);
    assert.equal((await deliver({ ...event, type: 'customer.subscription.updated' })).status, 200);
    delete process.env.STRIPE_CONNECT_WEBHOOK_SECRET;
    assert.equal((await deliver(event)).status, 503);
  } finally {
    if (previousConnect === undefined) delete process.env.STRIPE_CONNECT_WEBHOOK_SECRET;
    else process.env.STRIPE_CONNECT_WEBHOOK_SECRET = previousConnect;
    if (previousBilling === undefined) delete process.env.STRIPE_WEBHOOK_SECRET;
    else process.env.STRIPE_WEBHOOK_SECRET = previousBilling;
    if (previousKey === undefined) delete process.env.STRIPE_SECRET_KEY;
    else process.env.STRIPE_SECRET_KEY = previousKey;
  }
});
