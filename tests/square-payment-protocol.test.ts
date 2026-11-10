import assert from 'node:assert/strict';
import test from 'node:test';
import { createHmac } from 'node:crypto';
import {
  squareOneTimeOnly, squareQuickPayPayload, verifySquareWebhookSignature,
} from '../src/lib/square-workflow-checkout';

test('Square merchant checkout payload is hosted, exact-amount and idempotent per submission', () => {
  const payload = squareQuickPayPayload({
    workflowName: 'Association Event Registration',
    amountCents: 2500,
    locationId: 'location-test',
    submissionId: 'submission-uid',
    redirectUrl: 'https://unified.example.com/flow/workflow/complete?square=1&submission=submission-uid',
  });
  assert.equal(payload.idempotency_key, 'ica-square-submission-uid');
  assert.deepEqual(payload.quick_pay.price_money, { amount: 2500, currency: 'USD' });
  assert.equal(payload.checkout_options.allow_tipping, false);
  assert.equal(payload.quick_pay.location_id, 'location-test');
  assert.equal(payload.checkout_options.redirect_url.includes('submission-uid'), true);
  assert.throws(() => squareQuickPayPayload({
    workflowName: 'Invalid',
    amountCents: -1,
    locationId: 'location-test',
    submissionId: 'bad',
    redirectUrl: 'https://unified.example.com',
  }), /Invalid Square transaction amount/);
  assert.throws(() => squareQuickPayPayload({
    workflowName: 'Invalid',
    amountCents: 100,
    locationId: 'location-test',
    submissionId: 'bad',
    redirectUrl: 'http://unified.example.com',
  }), /Secure Square return address required/);
});

test('Square does not silently turn recurring dues into a one-time payment', () => {
  assert.equal(squareOneTimeOnly('EVENT', 'ONE_TIME'), true);
  assert.equal(squareOneTimeOnly('MEMBERSHIP', 'ONE_TIME'), true);
  assert.equal(squareOneTimeOnly('MEMBERSHIP', 'MONTHLY'), false);
  assert.equal(squareOneTimeOnly('MEMBERSHIP', 'YEARLY'), false);
});

test('Square notification verification rejects forged and modified bodies', () => {
  const names = ['SQUARE_WEBHOOK_SIGNATURE_KEY', 'SQUARE_WEBHOOK_NOTIFICATION_URL'] as const;
  const previous = names.map((name) => process.env[name]);
  const key = 'whsec-local-square-fixture-not-real';
  const url = 'https://unified.example.com/api/payments/square/webhook';
  process.env.SQUARE_WEBHOOK_SIGNATURE_KEY = key;
  process.env.SQUARE_WEBHOOK_NOTIFICATION_URL = url;
  const body = JSON.stringify({ type: 'payment.updated', merchant_id: 'merchant', data: { object: { payment: { order_id: 'order' } } } });
  const signature = createHmac('sha256', key).update(url + body, 'utf8').digest('base64');
  try {
    assert.equal(verifySquareWebhookSignature(body, signature), true);
    assert.equal(verifySquareWebhookSignature(body + ' ', signature), false);
    assert.equal(verifySquareWebhookSignature(body, Buffer.alloc(32).toString('base64')), false);
    assert.equal(verifySquareWebhookSignature(body, ''), false);
    process.env.SQUARE_WEBHOOK_NOTIFICATION_URL = url + '-changed';
    assert.equal(verifySquareWebhookSignature(body, signature), false);
  } finally {
    names.forEach((name, i) => {
      if (previous[i] === undefined) delete process.env[name];
      else process.env[name] = previous[i];
    });
  }
});
