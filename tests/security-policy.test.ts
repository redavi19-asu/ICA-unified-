import assert from 'node:assert/strict';
import test from 'node:test';
import { accountUnavailable, checkoutBlocked, isAdminRole, memberCourseAllowed } from '../src/lib/security-policy';

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
