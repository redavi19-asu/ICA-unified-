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


## PayPal partner onboarding and one-time checkout (draft)

- PayPal merchant consent uses PayPal's hosted Partner Referrals flow. ICA must be an approved PayPal partner for this integration; merchants never enter PayPal passwords or merchant API secrets into Unified.
- Server routes: `POST /api/payments/paypal/connect` and `GET /api/payments/paypal/callback`. Callback state is short-lived and bound to the authenticated organization and initiating owner/admin. An ICA-provided merchant ID is verified against PayPal's own merchant integration status.
- `POST /api/payments/paypal/check` is a one-click self-service connection status check. A revoked/incomplete connection cannot be selected for live checkout.
- One-time EVENT and MEMBERSHIP workflows can create merchant-scoped PayPal Orders v2 hosted approval, execute idempotent Capture after the buyer approves, retrieve the completed order and verify exact seller, order, submission, USD amount and completed capture status before granting access.
- `POST /api/payments/paypal/webhook` verifies the signature with PayPal's official verification API, then rechecks merchant/order/capture from PayPal; a browser return or notification alone never grants paid status.
- Recurring PayPal memberships are blocked before payable submission and are not enabled until a separate plan/subscription, renewal/failure and cancellation integration passes sandbox QC.
- PayPal checkout is disabled by default. Setting `PAYPAL_CUSTOMER_CHECKOUT_ENABLED=true` requires all partner credentials, `PAYPAL_WEBHOOK_ID` and operator approval. A production runtime also requires `PAYPAL_PRODUCTION_CHECKOUT_APPROVED=true`. Production must not run against sandbox provider credentials.
- Operator-owned settings/secrets: `PAYPAL_ENVIRONMENT`, `PAYPAL_PARTNER_CLIENT_ID`, `PAYPAL_PARTNER_CLIENT_SECRET`, `PAYPAL_PARTNER_MERCHANT_ID`, `PAYPAL_PARTNER_ATTRIBUTION_ID`, `PAYPAL_PARTNER_APPROVED`, `PAYPAL_MERCHANT_RETURN_URL`, `PAYPAL_WEBHOOK_ID`, and the gated checkout flags. Never store partner client secrets in source code.
- This code is a prepared sandbox implementation, NOT proof of live PayPal partnership, authorized merchant accounts, test charges, refunds or successful subscription collection.

## Unfinished processor implementations

PayPal onboarding and merchant-scoped one-time Orders/Capture verification are implemented behind strict partner-and-webhook flags, but require approved partner sandbox access, transaction testing, refund/reversal lifecycle, and recurring subscriptions before a real launch. Authorize.net requires secure per-merchant API credentials or an approved partner flow, Accept Hosted checkout and transaction verification. Braintree and Adyen require separate merchant onboarding and transaction lifecycle implementations. The labels in Payment Hub are **not** functional payment connectors yet.

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


## Business full refunds — safety-controlled workflow

- Organization owners/admins use `/workspace/payments/transactions` to review their paid membership and event transactions, with an explicit checkbox confirmation before full refunds. A separate action checks pending refund status.
- Refunds use the **original connected merchant payment**, never ICA's subscription Stripe account or the business's currently selected default processor. Merchant IDs, refund amount and payment references are loaded from verified server-side records; browsers cannot supply or override them.
- Stripe business one-time Checkout sessions persist their verified Payment Intent and connected account before granting paid access. Square persists the actual payment ID, and PayPal persists the completed capture ID.
- Full refunds use Square Refunds v2, PayPal Capture Refund v2 and Stripe connected-account Refunds APIs. Requests are idempotent per original submission, so retries don't create duplicate refunds. Partial refunds are **not yet supported** through Unified.
- The refund remains PENDING until the processor confirms completed status. Signed Stripe, Square and PayPal refund webhooks recheck the original refund server-to-server, and the business owner can check pending status manually.
- When a full refund is provider-confirmed, Unified marks the original submission `REFUNDED` and cancels its paid access. Delayed checkout webhooks cannot restore access or create another checkout on that refunded record.
- Business refund processing is **off by default**: `BUSINESS_REFUNDS_ENABLED=true`. Production additionally requires `BUSINESS_REFUNDS_PRODUCTION_APPROVED=true`. Do not enable these before an isolated end-to-end sandbox refund passes for each merchant provider.
- Because older Stripe receipts may predate the new payment record, those cannot automatically be refunded from Unified without independently verifying the original transaction. A merchant can use its own Stripe dashboard for such historical refunds.

## Authorize.net no-API-key merchant authorization (draft)

- Authorize.net supports OAuth for approved Reseller or Technology Partner applications, allowing a business owner/admin to approve Unified using the Authorize.net-hosted login screen.
- Tenant-scoped, one-use OAuth state and merchant JWT identity are verified through a server-to-server merchant API request. Access/refresh tokens are encrypted and refresh automatically.
- Authorize.net OAuth onboarding is guarded by `AUTHNET_PARTNER_OAUTH_APPROVED=true` plus managed partner client ID, secret, HTTPS callback URL, environment and encryption key. Public payment checkout remains **disabled** until secure Accept Hosted checkout, merchant-specific payment confirmation and signature-verified webhooks are built and tested.
- The Authorize.net merchant Signature Key is merchant-specific and needed for authenticated webhooks; do not ask customers to share raw keys through support chats or enable unverified webhooks.
- Braintree merchant-connect remains a closed beta according to its developer documentation. Adyen needs an approved Adyen for Platforms integration and hosted account-holder onboarding. Neither is a working payment option in Unified yet.

## Outstanding release requirements

- Real sandbox merchant accounts and transaction IDs for each processor; partner account approvals, production credentials and webhook subscriptions.
- Recurring membership billing lifecycle beyond initial Stripe checkout: renewal receipts, failed renewal recovery, cancellation, downgrade/expiration, and server-authorized entitlements. Square and PayPal recurring billing need provider-specific subscription implementation.
- Automatic payment reconciliation after provider outages, disputes/chargebacks, partial refunds, test accessibility and native-app redirect UX.
- Ensure one business cannot read another's merchant status, issue a refund on another's payment, or create a second charge/refund on retries.
- Run full Mac Mini staging simulation and save sanitized evidence. CI success is not a live transaction test.
