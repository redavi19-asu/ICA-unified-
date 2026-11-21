import assert from 'node:assert/strict';
import test from 'node:test';
import { BUSINESS_PAYMENT_PROVIDERS, providerCanAcceptUnifiedPayments } from '../src/lib/business-payment-providers';

test('business payment catalog never presents unimplemented connectors as active', () => {
  const ids = BUSINESS_PAYMENT_PROVIDERS.map((provider) => provider.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.includes('STRIPE'));
  for (const provider of BUSINESS_PAYMENT_PROVIDERS) {
    if (provider.integrationStatus === 'PLANNED') {
      assert.equal(providerCanAcceptUnifiedPayments(provider.id, true), false);
    }
  }
  assert.equal(providerCanAcceptUnifiedPayments('STRIPE', false), false);
  assert.equal(providerCanAcceptUnifiedPayments('STRIPE', true), true);
});
