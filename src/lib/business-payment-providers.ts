/**
 * Customer-owned payment providers are separate from ICA Unified's platform subscription.
 * Only CONNECTED providers may be used for live business checkouts.
 * Additional providers must implement verified onboarding, checkout and settlement
 * reconciliation before their status changes from PLANNED.
 */
export type BusinessPaymentProviderId = 'STRIPE' | 'SQUARE' | 'PAYPAL' | 'AUTHORIZE_NET' | 'BRAINTREE' | 'ADYEN';
export type BusinessPaymentProvider = {
  id: BusinessPaymentProviderId;
  name: string;
  summary: string;
  integrationStatus: 'IMPLEMENTED' | 'ONBOARDING_BETA' | 'PLANNED';
};

export const BUSINESS_PAYMENT_PROVIDERS: readonly BusinessPaymentProvider[] = [
  { id: 'STRIPE', name: 'Stripe', summary: 'Membership dues, registrations, and event payments using Stripe Connect.', integrationStatus: 'IMPLEMENTED' },
  { id: 'SQUARE', name: 'Square', summary: 'Authorize your Square merchant account. Customer checkout is not available yet.', integrationStatus: 'ONBOARDING_BETA' },
  { id: 'PAYPAL', name: 'PayPal', summary: 'Let customers pay using a business PayPal account.', integrationStatus: 'PLANNED' },
  { id: 'AUTHORIZE_NET', name: 'Authorize.net', summary: 'For established merchant-account processing.', integrationStatus: 'PLANNED' },
  { id: 'BRAINTREE', name: 'Braintree', summary: 'A future option for business payment processing.', integrationStatus: 'PLANNED' },
  { id: 'ADYEN', name: 'Adyen', summary: 'A future option for larger business payment operations.', integrationStatus: 'PLANNED' },
] as const;

export function providerCanAcceptUnifiedPayments(
  id: BusinessPaymentProviderId,
  connectionReady: boolean,
): boolean {
  // Never permit a placeholder connector to collect or record paid transactions.
  return id === 'STRIPE' && connectionReady;
}
