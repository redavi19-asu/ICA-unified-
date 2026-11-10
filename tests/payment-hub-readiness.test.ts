import assert from 'node:assert/strict';
import test from 'node:test';
import { paymentHubReadiness } from '../src/lib/payment-hub-readiness';

test('unconfigured payment provider gives actionable self-service steps instead of claiming checkout works', () => {
  const state = paymentHubReadiness({
    selected: 'SQUARE', platformReady: false, accountConnected: false,
    merchantReady: false, locationReady: false, checkoutEnabled: false,
    recurringEnabled: false,
  });
  assert.equal(state.readyForOneTime, false);
  assert.equal(state.readyForRecurring, false);
  assert.equal(state.steps.length, 5);
  assert.equal(state.steps[0].state, 'attention');
  assert.match(state.steps[0].guidance, /No changes are needed/);
  assert.match(state.steps[1].guidance, /sign in directly/);
  assert.match(state.steps[2].guidance, /Square location/);
  assert.equal(state.steps[3].state, 'not-available');
  assert.equal(state.steps[4].state, 'not-available');
  assert.equal(state.steps.some(step => /API keys|webhooks|copy secrets/.test(step.guidance)), false);
});

test('a connected Square account cannot be mistaken for live checkout or recurring dues', () => {
  const state = paymentHubReadiness({
    selected: 'SQUARE', platformReady: true, accountConnected: true,
    merchantReady: true, locationReady: true, checkoutEnabled: false,
    recurringEnabled: false,
  });
  assert.equal(state.readyForOneTime, false);
  assert.equal(state.readyForRecurring, false);
  assert.equal(state.steps.filter(step => step.state === 'complete').length, 3);
});

test('a verified Stripe connection can be configured for one-time and recurring payments', () => {
  const state = paymentHubReadiness({
    selected: 'STRIPE', platformReady: true, accountConnected: true,
    merchantReady: true, locationReady: true, checkoutEnabled: true,
    recurringEnabled: true,
  });
  assert.equal(state.readyForOneTime, true);
  assert.equal(state.readyForRecurring, true);
  assert.equal(state.steps.every(step => step.state === 'complete'), true);
});

test('test environment does not claim a live-ready merchant checkout', () => {
  const state = paymentHubReadiness({
    selected: 'SQUARE', platformReady: true, accountConnected: true,
    merchantReady: true, locationReady: true, checkoutEnabled: true,
    recurringEnabled: false, productionMode: false,
  });
  assert.equal(state.readyForOneTime, true);
  assert.equal(state.readyForRecurring, false);
  assert.match(state.headline, /test environment/i);
});
