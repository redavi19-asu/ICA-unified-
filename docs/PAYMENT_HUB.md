# ICA Unified — Payment Hub

## Money flows (must remain separate)

1. **ICA platform billing:** Organizations pay I Computer Anything for the ICA Unified Professional subscription ($299/month, as currently configured). This remains in `/workspace/billing` using the platform's Stripe subscription and webhook logic.
2. **Business customer payments:** Each organization collects its own membership dues and event registrations using its own connected processor. This belongs in `/workspace/payments`. The organization's balance must not be mixed with ICA's SaaS income.

## Current implementation

- The existing Stripe Connect Express onboarding and connected-account checkout for paid membership and event workflows remain in place.
- The Payment Hub exposes a clear Stripe status and onboarding route. Paid status must not be shown until the provider verifies a payment.
- Square, PayPal, Authorize.net, Braintree and Adyen are in the extension catalog but are **not connected or selectable**. They are placeholders for engineering work, never live payment options.
- No production payment secrets, account settings, transactions or billing plans are changed by this change.

## Safe provider-extension contract

Before marking any new processor ready, implement and test:

- Secure merchant authorization (prefer provider-hosted OAuth/onboarding), encrypted token handling and expiry/rotation. Never request raw card numbers or put merchant secrets in the UI.
- Per-organization connection storage and explicit default-provider selection, with authorization checks and tenant isolation.
- Checkout creation for dues and events that returns an approved hosted checkout URL.
- Server-side transaction verification of the correct organization, payment amount, currency, checkout ID and paid state. Verify and deduplicate signed webhooks.
- Refunds, recurring billing lifecycle, reconciliation, failed-payment recovery, disconnected accounts and support logs.
- Test-mode end-to-end flows, mobile and desktop usability tests, and provider approvals. Until these pass, the provider must remain unavailable.

## Go-live gates

- Verify that ICA platform Stripe billing has live credentials and prices, distinct from connected organization payments.
- Verify Stripe Connect merchant onboarding, signed webhook delivery and actual test-mode and live verification under the intended ICA account.
- Do not use an unrelated Stripe sandbox account.
- Verify real checkout and payment reconciliation before marking a non-Stripe connector supported.
- A successful CI build is not proof of a successful real payment.
