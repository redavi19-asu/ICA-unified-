import assert from 'node:assert/strict';
import test from 'node:test';
import { randomBytes } from 'node:crypto';
import { squareCheckoutEnabled } from '../src/lib/square-connect';

test('Square checkout cannot activate accidentally without signed webhooks and production approval', () => {
  const keys = [
    'SQUARE_ENVIRONMENT', 'SQUARE_APPLICATION_ID','SQUARE_APPLICATION_SECRET',
    'SQUARE_OAUTH_REDIRECT_URI','PAYMENT_CREDENTIALS_KEY','SQUARE_CUSTOMER_CHECKOUT_ENABLED',
    'SQUARE_WEBHOOK_SIGNATURE_KEY','SQUARE_WEBHOOK_NOTIFICATION_URL',
    'SQUARE_PRODUCTION_CHECKOUT_APPROVED','NODE_ENV',
  ] as const;
  const before = keys.map((name) => process.env[name]);
  Object.assign(process.env, {
    SQUARE_ENVIRONMENT: 'sandbox',
    SQUARE_APPLICATION_ID: 'demo-app',
    SQUARE_APPLICATION_SECRET: 'demo-app-secret',
    SQUARE_OAUTH_REDIRECT_URI: 'https://unified.example.com/api/payments/square/callback',
    PAYMENT_CREDENTIALS_KEY: randomBytes(32).toString('base64'),
    SQUARE_CUSTOMER_CHECKOUT_ENABLED: 'true',
    SQUARE_WEBHOOK_SIGNATURE_KEY: 'sandbox-test-signing-key',
    SQUARE_WEBHOOK_NOTIFICATION_URL: 'https://unified.example.com/api/payments/square/webhook',
    NODE_ENV: 'test',
  });
  try {
    assert.equal(squareCheckoutEnabled(), true, 'explicit sandbox test setup');
    delete process.env.SQUARE_WEBHOOK_SIGNATURE_KEY;
    assert.equal(squareCheckoutEnabled(), false, 'must have webhook signing key');
    process.env.SQUARE_WEBHOOK_SIGNATURE_KEY = 'sandbox-test-signing-key';
    process.env.SQUARE_WEBHOOK_NOTIFICATION_URL = 'http://unified.example.com/webhook';
    assert.equal(squareCheckoutEnabled(), false, 'must have HTTPS webhook');
    process.env.SQUARE_WEBHOOK_NOTIFICATION_URL = 'https://unified.example.com/api/payments/square/webhook';

    process.env.NODE_ENV = 'production';
    assert.equal(squareCheckoutEnabled(), false, 'never collect sandbox payments from production app');
    process.env.SQUARE_ENVIRONMENT = 'production';
    assert.equal(squareCheckoutEnabled(), false, 'production requires independent approval switch');
    process.env.SQUARE_PRODUCTION_CHECKOUT_APPROVED = 'true';
    assert.equal(squareCheckoutEnabled(), true, 'production approval with notification configuration');
    process.env.SQUARE_CUSTOMER_CHECKOUT_ENABLED = 'false';
    assert.equal(squareCheckoutEnabled(), false, 'can be shut off without changing a merchant');
  } finally {
    keys.forEach((key, i) => {
      if (before[i] === undefined) delete process.env[key];
      else process.env[key] = before[i];
    });
  }
});
