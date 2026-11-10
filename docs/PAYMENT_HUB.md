# ICA Unified — Payment Hub

## Money flows (must remain separate)

1. **ICA platform billing:** Organizations pay I Computer Anything for the ICA Unified Professional subscription ($299/month, as currently configured). This remains in `/workspace/billing` using the platform's Stripe subscription and webhook logic.
2. **Business customer payments:** Each organization collects its own membership dues and event registrations using its own connected processor. This belongs in `/workspace/payments`. The organization's balance must not be mixed with ICA's SaaS income.

## Current implementation

- The existing Stripe Connect Express onboarding and connected-account checkout for paid membership and event workflows remain in place.
- The Payment Hub exposes a clear Stripe status and onboarding route. Paid status must not be shown until the provider verifies a payment.
- **Square merchant authorization is implemented as a guarded beta**: it uses server-side OAuth state, the Square-hosted consent page, encrypted token storage, refresh token rotation, organization isolation, and a verified location picker for businesses with more than one location.
- **Square payments are NOT enabled**: hosted checkout, payment status reconciliation, signature-verified Square webhooks, refunds and Square subscriptions remain launch gates. An authorized Square account must NOT be labeled as capable of collecting payments until these are tested and approved.
- PayPal, Authorize.net, Braintree and Adyen are still in the extension catalog as **not available**. They must not be selectable for live payment processing.
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

## Square merchant-onboarding configuration (platform operator only)

In the intended ICA Unified Cloudflare Worker environment, set these private configuration values before enabling the Square authorization button:

- `SQUARE_ENVIRONMENT=sandbox` during development; explicitly switch to `production` only after a provider-approved live launch.
- `SQUARE_APPLICATION_ID` from the Square Developer Console.
- `SQUARE_APPLICATION_SECRET` as a managed secret, never in GitHub source or client code.
- `SQUARE_OAUTH_REDIRECT_URI=https://unified.icomputeranything.com/api/payments/square/callback` (register the exact URI in Square's developer portal).
- `PAYMENT_CREDENTIALS_KEY`: securely generated 32 random bytes encoded as base64. This key encrypts merchant tokens at rest. Plan and test a controlled key-rotation procedure before changing it.

**Business onboarding journey:** Business owner opens Payment Hub → Connect Square business account → Square-hosted consent screen → callback validates one-time state, exact organization/user and environment → ICA exchanges authorization code server-to-server → location verification → merchant chooses eligible payment location, if needed.

**Safeguards:** The customer cannot view OAuth tokens. Do not use a personal access token in place of merchant consent. Restrict access to organization OWNER/ADMIN accounts. When the Square application is not configured, the UI must show an unavailable setup message rather than pretending the business can collect through Square.

**Verification:** The new automated tests check authorize URL scopes, AES-256-GCM encryption/tamper detection, merchant isolation, replay rejection and location selection using local fixtures. These are not live Square API confirmations or payment transactions.

**PayPal onboarding:** PayPal Partner Referrals onboarding requires partner approval and a supported partner configuration. Do not collect businesses' PayPal passwords or raw API secrets in ICA to bypass that process.
