# Customer launch QC — 2026-10-11

## Implemented

- Public `/developers` guide linked from the home page and Integrations. Documents private keys, member invitations, company isolation, subscription enforcement, webhook signature verification, and the current single-attempt delivery limit.
- Registration, invitation acceptance, and social onboarding use the real D1 binding's atomic batch instead of Prisma transactions that the D1 adapter cannot honor. Invitation acceptance claims a token once, checks current pending/expiry state inside the batch, and guards a concurrent newly-created identity against a different password.
- Invitation acceptance writes membership and activity together. Acceptance claims reference the invitation with cascading deletion.
- Corrupted API scope policies and missing/invalid/zero expiries fail closed.

## Verification

`npm test` includes an isolated customer journey using real Next route handlers, JWT sessions, Prisma, and a SQLite adapter shaped like D1. The test supplies Next's request-cookie context; it does not replace application auth. No production users, emails, charges, provider credentials, or customer records are used.

The journey covers registration, password login, creating a scoped API key, inviting and accepting members, concurrent invitation acceptance/replay, creating a course and lesson, assigning a learner, completing the course, issuing one credential across repeated completion, mobile password login and credential wallet, event registration/check-in and repeat attendance, cross-organization course/check-in denial, member restrictions, webhook HMAC/organization isolation, verified social-profile onboarding with a one-time ticket, and revoked API key denial.

Social-profile data and webhook receivers are local fixtures. Google/Apple/Microsoft consent screens, real email delivery, camera scanning, mobile hardware, and an actual production Stripe transaction are separate release gates. A fixture social ticket proves onboarding logic, not provider end-to-end login.

`tests/fixtures/application-schema.sql` is generated from the current Prisma schema. Refresh after schema changes with `DATABASE_URL=file:/tmp/qc.db npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script`.

Both production compilation and changed-source lint/type checks passed. Browser QC confirms the public developer guide fits a 390px viewport. Native installers were not rebuilt.

## Deployment and remaining launch gates

InvitationAcceptance is created idempotently by the acceptance route before the atomic batch. Deploying this change does not enable payments or issue customer keys automatically. Owners/admins create per-organization keys in Integrations; do not distribute the company's Stripe secret key.

Live configuration inspection on 2026-10-11 confirmed the Unified Worker has STRIPE_WEBHOOK_SECRET but no STRIPE_SECRET_KEY. Its disabled Stripe endpoint and production restricted API key must be completed and tested together before live checkout is enabled. Webhooks currently have one attempt; missed member events require API reconciliation.

API access currently follows the existing Unified subscription; this change does not invent an additional API fee or usage billing.
