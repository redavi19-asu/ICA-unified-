# ICA Unified — Cloudflare operations

Updated October 12, 2026. The production web app is deployed at `https://unified.icomputeranything.com` on Worker `ica-unified`; Cloudflare migration is complete for this application path.

## Runtime

- Next.js is packaged with OpenNext. `custom-worker.ts` forwards application requests and handles scheduled work.
- The `DB` binding points to the Unified D1 database. Production data access uses Prisma's D1 adapter; code requiring an atomic transaction uses direct D1 `batch()` because Prisma transactions are not honored by that adapter.
- `wrangler.jsonc` records the bindings and a `*/5 * * * *` schedule. The scheduled handler drains due saved webhooks and purges expired training archives independently.
- Runtime readiness checks create required auxiliary tables idempotently. `/api/health` checks application/schema readiness; it does not prove every provider, payment flow or native app works.
- Customer sessions are organization-scoped. Platform sessions and `/platform/login` are separate. Account completion invalidates user sessions and removes the User record; subsequent access must fail.

## Releases

The `ICA Unified Build` workflow checks pull requests. A merge to `main` runs validation and then OpenNext build/Cloudflare deployment when repository credentials are configured. Inspect the deployment step: a green workflow alone can include a skipped deployment if secrets are absent. Verify the exact commit, Worker version, schedule and live health before reporting a release as live.

Use one consolidated change and its normal checks/deployment. Do not run iOS, Android or desktop builds merely to ship web directions. Native release gates are documented separately.

## Deletion and retention operations

Follow [Unified directions](UNIFIED_DIRECTIONS.md) for human review and customer confirmation. Never automatically complete all pending requests. Personal-account completion uses an atomic D1 batch; archives contain limited de-identified training/compliance facts and expire 90 days after completion. Cleanup processes up to 100 expired archives per scheduled invocation. Private receipts remain available until 30 days after archive expiry. Workspace closure, billing and external-data review are separate.

Apple grants are encrypted using a purpose-derived key from `AUTH_SECRET`. Coordinate any secret rotation with grant migration/reconnection planning: unreadable old grants must block deletion until the account holder reconnects, not be treated as revoked. Provider credentials and signing material belong in managed secrets, not source, public documentation or chat.

## Safe verification

Use local disposable D1 fixtures for destructive deletion and expiry tests. Check production health, policy pages, status-page availability and unauthenticated access guards read-only. Do not remove production accounts or trigger real payments as a deployment test. Backend success does not establish native signing, device behavior, Apple approval or live billing readiness.
