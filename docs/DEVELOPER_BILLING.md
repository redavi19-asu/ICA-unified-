# Unified developer subscription billing — staged launch (2026-10-30)

This implementation is intentionally **disabled by default**. It is an optional developer add-on for signed-in business/organization owners and administrators. It is NOT an independent anonymous developer account system. Existing company subscriptions, API key authentication, existing authorized access, and ordinary Stripe subscription records are preserved.

## Draft plans, NOT yet activated or available for purchase

- Developer Starter: $29.00/month, 25,000 accepted API requests each Stripe billing period.
- Developer Pro: $99.00/month, 150,000 accepted API requests each Stripe billing period.
- No per-request overage charge; once a paid developer subscription consumes its allowance, API access returns HTTP 429. Per-key minute rate limits still apply.
- These are **proposed launch prices** awaiting business approval and creation as separate recurring Stripe Prices. Do not advertise as an active sale until checkout and webhooks pass live-account testing.

## Architecture

- Developer subscriptions have **separate Stripe customers** from operating subscriptions, separate database records, and separate usage counters.
- API authorization still requires an active existing company/organization subscription and the proper API-key scope. This add-on does not replace regular SaaS billing or independently provision a customer workspace.
- Existing customers without a developer subscription are grandfathered onto existing API terms; quota metering is active only for organizations with a recorded developer subscription while the feature switch is on.
- Subscription status is derived from authenticated Stripe webhook events (using the existing webhook endpoint) and the current Stripe subscription snapshot. Subscription price, quantity, currency, monthly interval, Stripe customer, and organization link must all match.
- Usage counts are atomic by organization and Stripe billing period, and a successful API request cannot exceed the fixed quota. Calls denied by the existing permission or per-minute rate limit are not charged.
- Only owners/admins can start a developer Checkout or manage a developer Stripe billing portal; keys and Stripe secrets are never displayed on the public pricing page.

## Activation checklist — MUST complete before enabling

1. Confirm the correct production Stripe account for **Unified**. The separately connected PCG test account must NOT be used for these products.
2. Create two NEW USD monthly recurring Stripe Prices with exact values $29 and $99 on that same production account; confirm tax treatment and customer terms.
3. Configure the backend secret/bindings `STRIPE_DEVELOPER_STARTER_PRICE_ID` and `STRIPE_DEVELOPER_PRO_PRICE_ID` as the corresponding price IDs. Keep existing Stripe operating prices unchanged.
4. Verify current `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` correspond to the correct same live account and webhook endpoint; ensure the endpoint receives checkout.session.completed and customer.subscription.created/updated/deleted.
5. Validate customer identity, checkout cancellation, completed checkout, signed webhook replay/out-of-order events, failed payment, cancellation at period end, renewal/period rollover, exhausted quota, cross-tenant denial and Stripe portal return paths with test customers.
6. Verify the configured developer portal can manage these developer-only subscriptions and cannot change base operating subscriptions.
7. Set `ICA_DEVELOPER_BILLING_ENABLED=true` **only after** the other checks succeed. Rebuild/redeploy if needed and verify live origin, user sessions and HTTP response codes.
8. Review quota reporting, retention/pruning of old usage periods and the approved API pricing terms before announcing public availability.

## Operational cautions

- The proposal intentionally does **not** implement overage invoicing, a public API-only developer signup, automatic prorated plan changes, an SDK, or refunds.
- Existing users remain unaffected by the disabled configuration. Do not silently back-charge existing businesses.
- Any live Stripe prices/permissions or actual customer charges require verified production credentials, which are not supplied in this feature branch.
