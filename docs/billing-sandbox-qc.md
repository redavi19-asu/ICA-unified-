# Unified billing sandbox

The `wrangler.billing-sandbox.jsonc` configuration deploys the existing application to `ica-unified-billing-sandbox` with a separate D1 database. It does not bind the production customer database, central entitlements, production storage, email, or social-login secrets. Configure unique authentication secrets, a restricted Stripe test key, and the sandbox endpoint signing secret. Never reuse this configuration for production.

Validated October 10, 2026:

- 18 local tests passed, including webhook signature validation against altered bodies, forged signatures, and expired requests.
- Local OpenNext production build completed successfully.
- The deployed authenticated checkout route created a Professional test subscription checkout at $299 per month with the configured trial.
- Checkout completed using Stripe test card 4242; the signed webhook updated the synthetic organization and billing profile to trialing.
- A second checkout request was rejected with SUBSCRIPTION_ALREADY_EXISTS (409).
- The authenticated billing portal redirected to Stripe (303).
- Unauthenticated checkout redirected to login (307); unsigned webhooks were rejected (400).
- Canceling the synthetic test subscription updated both the billing profile and organization to canceled via the real webhook. No real charge was made.
- Restarting checkout after cancellation returned a new checkout successfully; two retries reused that same session. Relative trial duration keeps retries stable over time, and idempotency keys are scoped to subscription lifecycles.

The test fixture used a synthetic authenticated owner session; this does not certify registration, email delivery, or social sign-in. Full browser return, failed-payment handling, duplicate/out-of-order webhook delivery, other roles, and live-mode credentials/catalog remain to validate.
