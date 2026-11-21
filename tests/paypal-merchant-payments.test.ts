import assert from 'node:assert/strict';
import test from 'node:test';
import {
  paypalMerchantAssertion, paypalMerchantReadyFromProvider,
  paypalReferralPayload, paypalPartnerConfig,
} from '../src/lib/paypal-connect';
import { paypalAmountCents, paypalOrderCaptured, paypalCheckoutEnabled } from '../src/lib/paypal-workflow-checkout';

test('PayPal partner merchant assertion identifies only a configured seller', () => {
  const value = paypalMerchantAssertion('ica-partner-app', 'MERCHANT12345');
  const segments = value.split('.');
  assert.equal(segments.length, 3);
  assert.deepEqual(JSON.parse(Buffer.from(segments[0], 'base64url').toString('utf8')), { alg: 'none' });
  assert.deepEqual(JSON.parse(Buffer.from(segments[1], 'base64url').toString('utf8')),
    { iss: 'ica-partner-app', payer_id: 'MERCHANT12345' });
  assert.throws(() => paypalMerchantAssertion('ica-partner-app', 'x'));
});

test('PayPal partner referral uses hosted consent and payment/refund authorizations', () => {
  const request = paypalReferralPayload({
    trackingId: 'unique-state-for-business',
    returnUrl: 'https://unified.example.com/api/payments/paypal/callback',
  });
  assert.equal(request.tracking_id, 'unique-state-for-business');
  assert.deepEqual(request.products, ['EXPRESS_CHECKOUT']);
  assert.deepEqual(request.operations[0].api_integration_preference.rest_api_integration.third_party_details.features,
    ['PAYMENT', 'REFUND']);
  assert.throws(() => paypalReferralPayload({
    trackingId: 'bad', returnUrl: 'http://insecure.example.com',
  }), /NOT_HTTPS/);
});

test('PayPal merchant onboarding must be verified by its own provider response', () => {
  assert.equal(paypalMerchantReadyFromProvider({
    payments_receivable: true, primary_email_confirmed: true, oauth_integrations: [{integration_type:'THIRD_PARTY'}],
  }), true);
  assert.equal(paypalMerchantReadyFromProvider({
    payments_receivable: false, primary_email_confirmed: true, oauth_integrations: [{integration_type:'THIRD_PARTY'}],
  }), false);
  assert.equal(paypalMerchantReadyFromProvider({
    payments_receivable: true, primary_email_confirmed: true, oauth_integrations: [],
  }), false);
});

test('PayPal capture verifier rejects unverified money, wrong merchant and wrong amount', () => {
  const expected = {
    orderId: 'ORDER00001', merchantId: 'SELLER001',
    submissionId: 'SUBMISSION001', amountCents: 2500,
  };
  const base = {
    id: 'ORDER00001', status: 'COMPLETED',
    purchase_units: [{
      custom_id: 'SUBMISSION001',
      payee: { merchant_id: 'SELLER001' },
      amount: { currency_code: 'USD', value: '25.00' },
      payments: { captures: [{
        id: 'CAPTURE00001', status: 'COMPLETED',
        amount: { currency_code: 'USD', value: '25.00' },
      }] },
    }],
  };
  assert.deepEqual(paypalOrderCaptured(base, expected), { captured: true, captureId: 'CAPTURE00001' });
  assert.equal(paypalOrderCaptured({...base, status:'APPROVED'}, expected).captured, false);
  assert.equal(paypalOrderCaptured({...base, id:'ORDER99999'}, expected).captured, false);
  assert.equal(paypalOrderCaptured({...base, purchase_units:[{
    ...base.purchase_units[0], payee:{merchant_id:'DIFFERENT'},
  }]}, expected).captured, false);
  assert.equal(paypalOrderCaptured({...base, purchase_units:[{
    ...base.purchase_units[0], amount:{currency_code:'USD',value:'24.99'},
  }]}, expected).captured, false);
  assert.equal(paypalOrderCaptured({...base, purchase_units:[{
    ...base.purchase_units[0], payments:{captures:[{
      id:'CAPTURE00001',status:'PENDING',amount:{currency_code:'USD',value:'25.00'},
    }]},
  }]}, expected).captured, false);
  assert.equal(paypalAmountCents('25.00'), 2500);
  assert.equal(paypalAmountCents('25.001'), null);
  assert.equal(paypalAmountCents('-25.00'), null);
});

test('PayPal checkout remains disabled without partner approval, webhook ID and production release switch', () => {
  const fields = ['PAYPAL_PARTNER_CLIENT_ID','PAYPAL_PARTNER_CLIENT_SECRET','PAYPAL_PARTNER_MERCHANT_ID',
    'PAYPAL_PARTNER_ATTRIBUTION_ID','PAYPAL_PARTNER_APPROVED','PAYPAL_MERCHANT_RETURN_URL',
    'PAYPAL_ENVIRONMENT','PAYPAL_CUSTOMER_CHECKOUT_ENABLED','PAYPAL_WEBHOOK_ID',
    'PAYPAL_PRODUCTION_CHECKOUT_APPROVED','NODE_ENV'] as const;
  const previous = fields.map((field) => process.env[field]);
  Object.assign(process.env, {
    PAYPAL_PARTNER_CLIENT_ID:'demo-partner-client',
    PAYPAL_PARTNER_CLIENT_SECRET:'demo-partner-secret',
    PAYPAL_PARTNER_MERCHANT_ID:'DEMOSELLER001',
    PAYPAL_PARTNER_ATTRIBUTION_ID:'DEMO_APP',
    PAYPAL_PARTNER_APPROVED:'true',
    PAYPAL_MERCHANT_RETURN_URL:'https://unified.example.com/api/payments/paypal/callback',
    PAYPAL_ENVIRONMENT:'sandbox',
    PAYPAL_CUSTOMER_CHECKOUT_ENABLED:'true',
    PAYPAL_WEBHOOK_ID:'WEBHOOKTEST001',
    NODE_ENV:'test',
  });
  try {
    assert.equal(paypalPartnerConfig().configured, true);
    assert.equal(paypalCheckoutEnabled(), true);
    delete process.env.PAYPAL_PARTNER_APPROVED;
    assert.equal(paypalCheckoutEnabled(), false);
    process.env.PAYPAL_PARTNER_APPROVED='true';
    delete process.env.PAYPAL_WEBHOOK_ID;
    assert.equal(paypalCheckoutEnabled(), false);
    process.env.PAYPAL_WEBHOOK_ID='WEBHOOKTEST001';
    process.env.NODE_ENV='production';
    assert.equal(paypalCheckoutEnabled(), false);
    process.env.PAYPAL_ENVIRONMENT='production';
    assert.equal(paypalCheckoutEnabled(), false);
    process.env.PAYPAL_PRODUCTION_CHECKOUT_APPROVED='true';
    assert.equal(paypalCheckoutEnabled(), true);
  } finally {
    fields.forEach((field,i) => {
      if (previous[i] === undefined) delete process.env[field];
      else process.env[field] = previous[i];
    });
  }
});
