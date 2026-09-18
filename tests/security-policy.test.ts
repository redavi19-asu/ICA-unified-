import assert from 'node:assert/strict';
import test from 'node:test';
import {
  accountUnavailable,
  apiKeyExpired,
  apiScopeAllowed,
  checkoutBlocked,
  isAdminRole,
  memberCourseAllowed,
  sessionIssuedAfterInvalidation,
} from '../src/lib/security-policy';

test('admin roles are explicit', () => {
  assert.equal(isAdminRole('OWNER'), true);
  assert.equal(isAdminRole('ADMIN'), true);
  assert.equal(isAdminRole('MANAGER'), true);
  assert.equal(isAdminRole('MEMBER'), false);
});

test('suspended and cancelled accounts are unavailable', () => {
  assert.equal(accountUnavailable('SUSPENDED', 'ACTIVE'), true);
  assert.equal(accountUnavailable('ACTIVE', 'CANCELLED'), true);
  assert.equal(accountUnavailable('ACTIVE', 'ACTIVE'), false);
});

test('members only access published assigned training', () => {
  assert.equal(memberCourseAllowed('MEMBER', true, true), true);
  assert.equal(memberCourseAllowed('MEMBER', false, true), false);
  assert.equal(memberCourseAllowed('MEMBER', true, false), false);
  assert.equal(memberCourseAllowed('ADMIN', false, false), true);
});

test('existing nonterminal Stripe subscriptions block checkout', () => {
  assert.equal(checkoutBlocked('sub_123', 'trialing'), true);
  assert.equal(checkoutBlocked('sub_123', 'past_due'), true);
  assert.equal(checkoutBlocked(null, 'not_connected'), false);
  assert.equal(checkoutBlocked('sub_old', 'canceled'), false);
});

test('session invalidation rejects tokens issued before the cutoff', () => {
  assert.equal(sessionIssuedAfterInvalidation(999, 1000), false);
  assert.equal(sessionIssuedAfterInvalidation(1000, 1000), true);
  assert.equal(sessionIssuedAfterInvalidation(1001, 1000), true);
  assert.equal(sessionIssuedAfterInvalidation(0, 0), false);
});

test('API scopes require the exact permission or wildcard', () => {
  assert.equal(apiScopeAllowed(['members:read'], 'members:read'), true);
  assert.equal(apiScopeAllowed(['members:read'], 'members:write'), false);
  assert.equal(apiScopeAllowed(['*'], 'members:write'), true);
});

test('API key expiration is time bounded', () => {
  const now = 10_000;
  assert.equal(apiKeyExpired(9_999, now), true);
  assert.equal(apiKeyExpired(10_000, now), true);
  assert.equal(apiKeyExpired(10_001, now), false);
  assert.equal(apiKeyExpired(null, now), false);
});
