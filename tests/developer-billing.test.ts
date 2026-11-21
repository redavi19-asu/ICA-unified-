import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEVELOPER_PLANS, developerBillingReady } from '../src/lib/developer-billing';

test('developer billing fails closed until separately enabled and fully priced', () => {
  const keys = [
    'ICA_DEVELOPER_BILLING_ENABLED', 'ICA_DEVELOPER_BILLING_ENFORCE_FROM', 'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET',
    'STRIPE_DEVELOPER_STARTER_PRICE_ID', 'STRIPE_DEVELOPER_PRO_PRICE_ID',
  ] as const;
  const old = keys.map(key => process.env[key]);
  try {
    for (const key of keys) delete process.env[key];
    assert.equal(developerBillingReady(), false);
    process.env.STRIPE_SECRET_KEY = 'sk_test_synthetic_only';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_synthetic_only';
    process.env.STRIPE_DEVELOPER_STARTER_PRICE_ID = 'price_starter_synthetic';
    process.env.STRIPE_DEVELOPER_PRO_PRICE_ID = 'price_pro_synthetic';
    assert.equal(developerBillingReady(), false);
    process.env.ICA_DEVELOPER_BILLING_ENABLED = 'true';
    assert.equal(developerBillingReady(), false);
    process.env.ICA_DEVELOPER_BILLING_ENFORCE_FROM = '2026-11-01T00:00:00Z';
    assert.equal(developerBillingReady(), true);
    delete process.env.STRIPE_DEVELOPER_PRO_PRICE_ID;
    assert.equal(developerBillingReady(), false);
  } finally {
    keys.forEach((key, index) => {
      if (old[index] === undefined) delete process.env[key];
      else process.env[key] = old[index];
    });
  }
});

test('developer tiers have fixed disclosed allowances and no per-call overage', () => {
  assert.deepEqual(DEVELOPER_PLANS, {
    starter: { priceCents: 2900, monthlyCalls: 25000 },
    pro: { priceCents: 9900, monthlyCalls: 150000 },
  });
});
