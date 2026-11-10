/**
 * Plain-language, merchant-safe diagnostics. Never expose API credentials,
 * webhook secrets, provider errors or private customer data in the UI.
 */
export type PaymentHubStep = {
  id: 'platform' | 'account' | 'location' | 'checkout' | 'recurring';
  label: string;
  state: 'complete' | 'attention' | 'not-available';
  guidance: string;
};

export type PaymentHubState = {
  readyForOneTime: boolean;
  readyForRecurring: boolean;
  headline: string;
  steps: PaymentHubStep[];
};

export function paymentHubReadiness(input: {
  selected: 'STRIPE' | 'SQUARE' | 'PAYPAL';
  platformReady: boolean;
  accountConnected: boolean;
  merchantReady: boolean;
  locationReady: boolean;
  checkoutEnabled: boolean;
  recurringEnabled: boolean;
  productionMode?: boolean;
}): PaymentHubState {
  const steps: PaymentHubStep[] = [
    {
      id: 'platform',
      label: 'Payment service available',
      state: input.platformReady ? 'complete' : 'attention',
      guidance: input.platformReady
        ? 'Unified can securely connect to this payment service.'
        : 'Unified is finishing provider setup. No changes are needed in your business account.',
    },
    {
      id: 'account',
      label: 'Business account connected',
      state: input.accountConnected ? 'complete' : 'attention',
      guidance: input.accountConnected
        ? 'Your organization has authorized this payment service.'
        : 'Choose Connect account and sign in directly with your payment provider.',
    },
    {
      id: 'location',
      label: 'Payments authorized',
      state: input.merchantReady && input.locationReady ? 'complete' : 'attention',
      guidance: input.merchantReady && input.locationReady
        ? 'Your merchant account is configured to collect payments.'
        : input.selected === 'SQUARE'
          ? 'Choose a Square location that can accept card payments, or reconnect your account.'
          : input.selected === 'PAYPAL'
            ? 'Finish PayPal business authorization and confirm your merchant account with PayPal.'
            : 'Finish your Stripe onboarding and activate charges and payouts.',
    },
    {
      id: 'checkout',
      label: 'Customer checkout available',
      state: input.checkoutEnabled && input.platformReady && input.accountConnected &&
        input.merchantReady && input.locationReady ? 'complete' : 'not-available',
      guidance: input.checkoutEnabled
        ? 'Customers can complete supported payments through your own provider.'
        : 'Checkout is not enabled for this provider yet. Unified will not claim any payment was received.',
    },
    {
      id: 'recurring',
      label: 'Recurring membership dues',
      state: input.recurringEnabled && input.checkoutEnabled && input.platformReady &&
        input.accountConnected && input.merchantReady && input.locationReady
        ? 'complete' : 'not-available',
      guidance: input.recurringEnabled
        ? 'Automatic recurring dues are supported for this provider when checkout is ready.'
        : 'Recurring dues are not supported on this connection. Use a supported provider or select one-time dues.',
    },
  ];
  const readyForOneTime = steps.slice(0, 4).every((step) => step.state === 'complete');
  const readyForRecurring = steps.every((step) => step.state === 'complete');
  return {
    readyForOneTime,
    readyForRecurring,
    headline: readyForOneTime
      ? (input.productionMode === false
          ? 'Payment setup is ready in the test environment only'
          : 'Payment connection configured — verify with a test checkout')
      : 'A few steps remain before your business can collect payments',
    steps,
  };
}
