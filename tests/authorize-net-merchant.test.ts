import assert from 'node:assert/strict';
import test from 'node:test';
import {
  authorizeNetPartnerConfig, buildAuthorizeNetConsentUrl, merchantIdFromAuthorizeNetToken,
} from '../src/lib/authorize-net-connect';
import { randomBytes } from 'node:crypto';

test('Authorize.net merchant linking stays on the merchant provider with one-time state', () => {
  for (const environment of ['sandbox','production'] as const) {
    const url = new URL(buildAuthorizeNetConsentUrl({
      environment,
      clientId: 'registered-ica-client',
      callbackUrl: 'https://unified.example.com/api/payments/authorize-net/callback',
      state: 'unpredictable-state',
    }));
    assert.equal(url.hostname, environment === 'production' ? 'account.authorize.net' : 'sandbox.authorize.net');
    assert.equal(url.pathname, '/oauth/authorize');
    assert.equal(url.searchParams.get('sub'), 'oauth');
    assert.equal(url.searchParams.get('scope'), 'read,write');
    assert.equal(url.searchParams.get('state'), 'unpredictable-state');
  }
});

test('Authorize.net merchant token identity is extracted only from provider JWT response', () => {
  const jwt = 'eyJhbGciOiJSUzI1NiJ9.' +
    Buffer.from(JSON.stringify({merchant_id:325368})).toString('base64url') + '.demo-provider-signature';
  assert.equal(merchantIdFromAuthorizeNetToken(jwt),'325368');
  assert.throws(() => merchantIdFromAuthorizeNetToken('unparseable'), /INVALID/);
  assert.throws(() => merchantIdFromAuthorizeNetToken(
    'head.'+Buffer.from(JSON.stringify({merchant_id:'!'})).toString('base64url')+'.tail'
  ), /INVALID/);
});

test('Authorize.net is disabled until provider partnership and encryption key are configured', () => {
  const keys = ['AUTHNET_ENVIRONMENT','AUTHNET_PARTNER_CLIENT_ID','AUTHNET_PARTNER_CLIENT_SECRET',
    'AUTHNET_OAUTH_CALLBACK_URL','AUTHNET_PARTNER_OAUTH_APPROVED','PAYMENT_CREDENTIALS_KEY'] as const;
  const old = keys.map((key)=>process.env[key]);
  Object.assign(process.env, {
    AUTHNET_ENVIRONMENT:'sandbox',AUTHNET_PARTNER_CLIENT_ID:'demo-client',
    AUTHNET_PARTNER_CLIENT_SECRET:'demo-secret',
    AUTHNET_OAUTH_CALLBACK_URL:'https://unified.example.com/api/payments/authorize-net/callback',
    AUTHNET_PARTNER_OAUTH_APPROVED:'true',
    PAYMENT_CREDENTIALS_KEY:randomBytes(32).toString('base64'),
  });
  try {
    assert.equal(authorizeNetPartnerConfig().ready,true);
    delete process.env.AUTHNET_PARTNER_OAUTH_APPROVED;
    assert.equal(authorizeNetPartnerConfig().ready,false);
    process.env.AUTHNET_PARTNER_OAUTH_APPROVED='true';
    process.env.AUTHNET_OAUTH_CALLBACK_URL='http://insecure.example.com';
    assert.equal(authorizeNetPartnerConfig().ready,false);
    process.env.AUTHNET_OAUTH_CALLBACK_URL='https://unified.example.com/api/payments/authorize-net/callback';
    process.env.PAYMENT_CREDENTIALS_KEY='bad';
    assert.equal(authorizeNetPartnerConfig().ready,false);
  } finally {
    keys.forEach((name,i)=>{ if(old[i]===undefined) delete process.env[name]; else process.env[name]=old[i]; });
  }
});
