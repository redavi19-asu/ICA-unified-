# ICA Unified — Cloudflare production path

ICA Unified currently has a working application backend inside the Next.js app: authentication, organization registration, invitations, people/roles, learning APIs, sessions, and platform administration all run through server routes. Local/server persistence currently uses Prisma with SQLite.

## Why Cloudflare is not switched on yet

A Cloudflare account binding cannot be created from repository code alone. The production account must supply the Cloudflare account/database identifiers and secrets. SQLite is also a local file database, so production on Cloudflare should use D1 (or another production database) instead of copying the local `dev.db` file to an edge runtime.

## Production migration target

1. Create a Cloudflare D1 database for ICA Unified.
2. Bind that database to the Cloudflare deployment.
3. Add `AUTH_SECRET` and `PLATFORM_AUTH_SECRET` as encrypted production secrets.
4. Migrate the Prisma schema to the D1-compatible production data layer.
5. Deploy the Next.js application through the supported Cloudflare Next.js adapter/runtime.
6. Verify `/api/health`, organization registration, customer login, invitations, course completion, and `/platform` administration.

## Architecture already prepared

The application uses organization IDs as tenant boundaries. Customer authentication carries the organization ID and role in a signed HTTP-only session. Platform administrators use a completely separate signed platform session and a separate `/platform/login` entrance. Public company signup creates a new organization and makes the first user its OWNER. Customer organizations can be activated or suspended from Platform Control.

No production secret belongs in GitHub. Use `.env.example` only as a list of required variable names.
