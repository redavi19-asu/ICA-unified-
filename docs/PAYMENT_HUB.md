# ICA Unified — Payment Hub

## Money flows (must remain separate)

1. **ICA platform billing:** Organizations pay I Computer Anything for the ICA Unified Professional subscription ($299/month, as currently configured). This remains in `/workspace/billing` using the platform's Stripe subscription and webhook logic.
2. **Business customer payments:** Each organization collects its own membership dues and event registrations using its own connected processor. This belongs in `/workspace/payments`. The organization's balance must not be mixed with ICA's SaaS income.

## Current implementation

- The existing Stripe Connect Express onboarding and connected-account checkout for paid membership and event workflows remain in place.
- The Payment Hub exposes a clear Stripe status and onboarding route. Paid status must not be shown until the provider verifies a payment.
- **Square merchant authorization is implemented as a guarded beta**: it uses server-side OAuth state, the Square-hosted consent page, encrypted token storage, refresh token rotation, organization isolation, and a verified location picker for businesses with more than one location.
- **Square checkout and server-side one-time payment verification are now implemented behind a disabled-by-default feature flag**. This is not a live release: Square sandbox merchant onboarding, webhooks, refund lifecycle, Square subscription-plan billing, and production reconciliation must be tested before the feature is enabled for customers. An authorized Square account must NOT be labeled as capable of collecting payments until these are tested and approved.
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

**Verification:** Automated tests cover OAuth URL scopes, AES-256-GCM encryption/tamper detection, merchant isolation, replay rejection, location selection, one-time hosted payment-link payloads, signed Square webhook validation, server-side order/payment/amount verification, replay-safe finalization and tenant mismatches using isolated local fixtures. These are not actual Square sandbox or live transactions.

**PayPal onboarding:** PayPal Partner Referrals onboarding requires partner approval and a supported partner configuration. Do not collect businesses' PayPal passwords or raw API secrets in ICA to bypass that process.


## Checkout feature gates and API callbacks (engineering)

- ICA platform subscription remains on Stripe and is unaffected by any business provider selection.
- A business selects its **own** preferred checkout provider in Payment Hub; preferences are organization-scoped.
- Square payment links are created from the existing paid membership/event workflow. Callback path: `/flow/{workflowId}/complete?square=1&submission={submissionId}`. Square always redirects to the configured ICA application origin.
- Square payment notifications must be sent to `/api/payments/square/webhook`, using `SQUARE_WEBHOOK_SIGNATURE_KEY` and an exact `SQUARE_WEBHOOK_NOTIFICATION_URL` managed secret/configuration pair. The HMAC is checked against the raw body before any provider reconciliation.
- Square payment verification fetches the actual Square Order and Payment under the merchant OAuth token. It requires the saved organization, location, order ID, exact amount/currency and payment status `COMPLETED` to match before updating an ICA submission.
- Square currently supports only one-time event fees and one-time memberships. Monthly/yearly membership dues on Square are explicitly blocked **before** a payable application is created. Square's Catalog/Subscription plan-variation onboarding and recurring lifecycle are outstanding.
- `SQUARE_CUSTOMER_CHECKOUT_ENABLED=true` is **off by default** and must only be set after sandbox completion and approval; merely connecting a Square merchant account does not enable this feature.
- The Square merchant-authorization beta may be enabled separately from checkout, but must not be described as ready to collect funds.

## Unfinished processor implementations

PayPal needs a valid partner/merchant onboarding arrangement, per-merchant authorization, Orders/Capture verification and webhook validation. Authorize.net requires secure per-merchant API credentials or an approved partner flow, Accept Hosted checkout and transaction verification. Braintree and Adyen require separate merchant onboarding and transaction lifecycle implementations. The labels in Payment Hub are **not** functional payment connectors yet.

## Release acceptance

Run isolated test-mode workflows for each provider: merchant authorization, wrong merchant/tenant, wrong amount, one-time charge, recurring subscription renewal/cancel (where supported), webhook replay, refunds/disputes, failed payments, expired tokens, reconnection and payout status. Only enable payment-taking providers after their individual matrix passes. Never perform production test charges without explicit approval.


## Low-support product acceptance (required for launch)

A business owner should **never** be asked to paste payment API keys, configure webhooks, run commands, edit database rows or contact ICA support to complete normal payment onboarding.

- The Payment Hub displays a plain-language readiness checklist for the selected provider: platform availability, business authorization, merchant configuration, hosted checkout and recurring support.
- Provider selection revalidates the merchant's own account and Square payment location before saving changes, instead of trusting stale status flags.
- Business owners can check and repair Square account connections without exposing credentials. Expiring OAuth credentials refresh on the server when possible; revoked accounts show a reconnect action.
- Buyers whose provider is still processing are shown automatic, bounded payment status checks. They should not resubmit or pay again just because the browser came back before webhook settlement.
- Stripe business payment completion requires an actual paid Checkout Session with exact organization, workflow, submission, currency and amount. A completed but unpaid recurring session does not grant paid membership.
- Square checkout is disabled by default; a valid webhook signing key + HTTPS notification URL are mandatory. A production checkout additionally requires an explicit ICA production-approval flag. Production runtime must not collect with sandbox Square credentials.
- Errors shown to end users avoid secrets, provider stack traces and internal account IDs. The operator should retain sanitized diagnostic logs for unresolved cases.

The full customer/business simulation acceptance checklist lives in [PAYMENT_SIMULATION_QC.md](PAYMENT_SIMULATION_QC.md). Live merchant sandbox tests and partner approvals are still outstanding. These safeguards reduce routine support; they do not establish that support can be eliminated entirely.
