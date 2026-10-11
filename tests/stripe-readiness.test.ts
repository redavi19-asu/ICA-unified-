import assert from 'node:assert/strict';
import test from 'node:test';
import { isStripeCheckoutConfigured, createProfessionalCheckout } from '../src/lib/stripe-billing';

test('checkout requires API key, price and webhook secret before creating any session', async () => {
  const keys = ['STRIPE_SECRET_KEY', 'STRIPE_PROFESSIONAL_PRICE_ID', 'STRIPE_WEBHOOK_SECRET'] as const;
  const previous = keys.map(key => process.env[key]);
  const originalFetch = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = async () => { requests++; throw new Error('Checkout must not call Stripe'); };
  try {
    keys.forEach((key, i) => { process.env[key] = ['rk_test_synthetic', 'price_synthetic', 'whsec_synthetic'][i]; });
    assert.equal(isStripeCheckoutConfigured(), true);
    for (const missing of keys) {
      const value = process.env[missing];
      process.env[missing] = '  ';
      assert.equal(isStripeCheckoutConfigured(), false, missing);
      await assert.rejects(createProfessionalCheckout({ organizationId: 'not-created', organizationName: 'QC', ownerEmail: 'qc@example.com', origin: 'https://example.com' }), /STRIPE_NOT_CONFIGURED/);
      process.env[missing] = value;
    }
    assert.equal(requests, 0);
  } finally {
    globalThis.fetch = originalFetch;
    keys.forEach((key, i) => { if (previous[i] === undefined) delete process.env[key]; else process.env[key] = previous[i]; });
  }
});
