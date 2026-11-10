# ICA Unified — Payment Hub end-to-end simulation / no-support acceptance gates

**Purpose:** Prove that a nontechnical business owner can install/sign in, connect their own payment account, publish a paid workflow, and collect payment without a phone call, API key, webhook configuration, or support ticket. All provider-independent failures must be self-explanatory and recoverable. Verify both business and buyer experiences.

## Invariants

- ICA's subscription and each business's customer collections are strictly separate.
- Merchant OAuth secrets, raw card details, payment credentials and webhook signing keys never appear in browser HTML, support logs or tenant-facing APIs.
- All provider callbacks, checkout receipts, subscriptions and databases are tenant-scoped.
- A browser "success" redirect is never a receipt. Only server-verified paid transactions grant registration, access or receipts.
- Failed or unavailable provider checkout must never create PAID submissions.
- No provider is advertised as supported until its own end-to-end test matrix passes.
- Do not introduce fake payment accounts, production charges or real customers during staging QC.

## Simulation roles

1. **ICA Master:** Verifies ICA's subscription status, product-wide payment health and audit controls without accessing other merchants' private tokens. Confirm ICA billing remains untouched when a merchant changes processors.
2. **Business A:** Fresh owner. Opens Payment Hub, sees plain-language steps, connects supported test merchant account, chooses default provider, sets up paid event and member dues.
3. **Business B:** Separate business and merchant. Verify never sees business A's checkout records, merchant IDs, payment status, receipts or API configuration.
4. **Customer:** Visits public event and membership links without an ICA account; submits contact details, pays hosted checkout (sandbox only), sees confirmation, receives verified receipt.
5. **Support recovery:** Provider authorization expired/revoked, webhook delayed, location unavailable, failed/cancelled payment, duplicate submission, offline/poor mobile connection.

## Required automated + interactive checks

| Area | Test | Pass condition |
|---|---|---|
| First-time setup | New business without payment connection | Clear 5-step readiness, helpful next action; no broken controls |
| Stripe | Existing Connect onboarding and refresh | Business A merchant receives own dues; platform subscription unaffected |
| Square | OAuth, refresh, verified location selection | One-click connection; tokens encrypted and scoped; no pasted merchant API keys |
| Square | Pending, wrong amount, wrong merchant, fully paid, replayed webhook | No false PAID; only exactly matching completed money qualifies |
| Checkout | Success link before capture/settlement | PROCESSING, not PAID; bounded automatic status check, no second payment |
| Checkout | Repeated server callback or browser refresh | No repeated paid receipt or activation |
| Recurring | Stripe monthly/yearly membership | Payment and invoice status verified, renewal/cancellation handled, failed renewals safe |
| Recurring | Square monthly/yearly until implementation approved | Block BEFORE taking payable application; never charge one time silently |
| Outage | Payment provider or webhook temporarily unavailable | Retry-safe, pending retained, next steps visible; no lost application |
| Connection | Square expired/revoked token | Automatic token refresh where possible; simple reconnect otherwise |
| Cross-org | Business B reuses business A submission/order/merchant ID | Refused by server; no data leak |
| Fees | ICA platform subscription vs. member/event dues | Charged via independent accounting/provider context |
| Refunds | Refund/reversal/failure/dispute | Accurate business records; no falsely active access |
| Webhooks | Forged/incorrect signature, replay, wrong environment | Block; no paid status change |
| UX | iPhone, iPad, macOS, Windows, 390px web | Full setup without hidden buttons or technical steps |
| Accessibility | Screen reader labels, focus order and error copy | Usable without technical help or mouse |
| Recovery | Disconnected provider, wrong location, failed authorization | Reconnect/check status action restores normal path without support |
| Observability | Retry/failure diagnostics | Admin sees actionable reason with private data redacted |
| Apps | Installed app delegates hosted payment to browser | Secure return works; no unintended store-billing policy conflict |

## No-support release rule

Business owner must never see instructions to configure a webhook, paste an OAuth token, create a database, edit JSON, or contact technical support for routine setup. Required developer credentials and provider approvals belong to **ICA's** operator setup, not the merchant's workflow.

The simulation is **NOT COMPLETE** until Mac Mini / browser flows run against disposable test businesses and each processor's real sandbox. Do not merge the Payment Hub draft or submit store builds on the strength of unit tests alone.

## External gates

- Square: valid ICA Square developer application and registered callback, webhook, sandbox and later approved production credentials; provider-independent refunds/subscriptions remain unfinished.
- PayPal: approved partner access for merchant onboarding and capture, sandbox IDs, notifications; not currently merchant-enabled.
- Authorize.net/Braintree/Adyen: compliant provider-specific seller connection and end-to-end testing; not currently merchant-enabled.
- Apple/Microsoft native apps: signing, secure hosted-checkout redirect and purchase policy review before submission.

## Exit criteria

All supported processors must pass authorization, customer checkout, settlement, refunds, charge failures and account recovery in the sandbox. Demonstrate the same user workflow from both Business A and Customer views, no manual API-key configuration, no unresolved critical defects and no unexplained support-required error states. Record evidence (screenshots, sanitized logs, build SHA and provider sandbox receipt IDs) for QC review.
