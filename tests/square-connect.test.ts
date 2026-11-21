import assert from 'node:assert/strict';
import test from 'node:test';
import { randomBytes } from 'node:crypto';
import {
  buildSquareAuthorizationUrl, encryptSquareCredential, decryptSquareCredential, validEncryptionKey,
} from '../src/lib/square-connect';

test('Square OAuth authorization stays on Square and requests needed merchant scopes', () => {
  for (const mode of ['sandbox', 'production'] as const) {
    const url = new URL(buildSquareAuthorizationUrl({
      mode, applicationId: 'square-app', redirectUri: 'https://unified.example.com/api/payments/square/callback',
      state: 'unpredictable-state',
    }));
    assert.equal(url.hostname, mode === 'production' ? 'connect.squareup.com' : 'connect.squareupsandbox.com');
    assert.equal(url.searchParams.get('state'), 'unpredictable-state');
    assert.equal(url.searchParams.get('session'), 'false');
    assert.equal(url.searchParams.get('redirect_uri'), 'https://unified.example.com/api/payments/square/callback');
    assert.match(url.searchParams.get('scope') || '', /PAYMENTS_READ/);
    assert.match(url.searchParams.get('scope') || '', /ORDERS_WRITE/);
  }
});

test('Square OAuth credentials encrypt at rest and reject invalid keys or tampering', () => {
  const key = randomBytes(32).toString('base64');
  assert.equal(validEncryptionKey(key), true);
  assert.equal(validEncryptionKey('not-a-valid-secret'), false);
  const encrypted = encryptSquareCredential('seller-token-not-for-client', key);
  assert.ok(encrypted.startsWith('v1:'));
  assert.ok(!encrypted.includes('seller-token-not-for-client'));
  assert.equal(decryptSquareCredential(encrypted, key), 'seller-token-not-for-client');
  const changed = encrypted.slice(0, -3) + 'abc';
  assert.throws(() => decryptSquareCredential(changed, key));
  assert.throws(() => decryptSquareCredential(encrypted, randomBytes(32).toString('base64')));
});
