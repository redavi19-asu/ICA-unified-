import assert from 'node:assert/strict';
import test from 'node:test';
import { deriveWorkflowSubmissionStatus, localTrialExpired } from '../src/lib/workflow-policy';

test('membership workflow respects approval and payment state', () => {
  assert.equal(deriveWorkflowSubmissionStatus({
    kind: 'MEMBERSHIP',
    approvalRequired: true,
    amountCents: 0,
  }), 'PENDING_REVIEW');

  assert.equal(deriveWorkflowSubmissionStatus({
    kind: 'MEMBERSHIP',
    approvalRequired: false,
    amountCents: 15000,
  }), 'PAYMENT_PENDING');

  assert.equal(deriveWorkflowSubmissionStatus({
    kind: 'MEMBERSHIP',
    approvalRequired: false,
    amountCents: 0,
  }), 'APPROVED');
});

test('event workflow enforces capacity before payment state', () => {
  assert.equal(deriveWorkflowSubmissionStatus({
    kind: 'EVENT',
    amountCents: 7500,
    capacity: 100,
    occupied: 10,
  }), 'PAYMENT_PENDING');

  assert.equal(deriveWorkflowSubmissionStatus({
    kind: 'EVENT',
    amountCents: 0,
    capacity: 100,
    occupied: 10,
  }), 'REGISTERED');

  assert.equal(deriveWorkflowSubmissionStatus({
    kind: 'EVENT',
    amountCents: 7500,
    capacity: 10,
    occupied: 10,
  }), 'WAITLISTED');
});

test('local trial expiry only applies to external trial organizations', () => {
  const now = Date.parse('2026-09-16T18:00:00Z');

  assert.equal(localTrialExpired({
    plan: 'trial',
    status: 'TRIAL',
    trialEndsAt: new Date('2026-09-15T18:00:00Z'),
    now,
  }), true);

  assert.equal(localTrialExpired({
    plan: 'trial',
    status: 'TRIAL',
    trialEndsAt: new Date('2026-09-17T18:00:00Z'),
    now,
  }), false);

  assert.equal(localTrialExpired({
    plan: 'internal',
    status: 'TRIAL',
    trialEndsAt: new Date('2026-09-15T18:00:00Z'),
    now,
  }), false);

  assert.equal(localTrialExpired({
    plan: 'professional',
    status: 'ACTIVE',
    trialEndsAt: new Date('2026-09-15T18:00:00Z'),
    now,
  }), false);
});
