# Dependency and release security maintenance

The web production dependency audit is a blocking CI gate. Development-only
advisories are still reported on every run but do not block production deployment
when the production dependency tree is clean. Prisma generation, schema validation,
linting, tests, mobile security checks, desktop metadata validation, and the
production build remain required.

The Prisma 6 configuration dependency is overridden to `deepmerge-ts` 8.0.2 to
address GHSA-ggr8-5vv4-36mx. This follows the same plain-object merge compatibility
analysis used by Prisma's upstream fix: https://github.com/prisma/orm/pull/30189.

## Metro build-tool braces advisory

As of October 3, 2026, GHSA-vfj7-8cjw-p6xm / CVE-2026-93687 affects every
published `braces` version through 3.0.3 and no patched npm release exists.
ICA Unified does not treat this as a blanket waiver. The mobile security gate
reads the checked-in lockfile and permits this advisory only while the dependency
path is exactly:

`@expo/metro-file-map` or `metro-file-map` -> `micromatch` -> `braces@3.0.3`.

Those packages are Metro source-discovery/build tooling rather than ICA Unified
mobile runtime code. If `braces` becomes reachable through any new package path,
the audit fails closed. The web production dependency audit is also independently
required to remain at zero known vulnerabilities.

When Expo/Metro/micromatch removes the vulnerable dependency or a patched braces
release becomes available, remove this tooling-only exception and update the
lockfile.

## Temporary mobile node-forge mitigation

As of October 2, 2026, npm has no patched node-forge release for
GHSA-86w9-cpqp-85rv / CVE-2026-85393. Expo's CLI uses this package.
`mobile/scripts/harden-forge.cjs` applies the nested DigestAlgorithm element-count
check proposed at https://github.com/digitalbazaar/forge/pull/1152 to the pinned
1.4.0 source. It fails on unexpected versions/source rather than silently skipping.
This is a locally maintained mitigation, not an upstream release.

The regression tests demonstrate that an RSA signature containing extra nested
DigestAlgorithm data is rejected, while valid signatures verify and altered
messages do not. The regression fails against unmodified node-forge 1.4.0.
Mobile installation must run lifecycle scripts. CI runs these tests again before
auditing and typechecking. `npm audit` will continue flagging the published version;
`npm run audit:security` permits only that precise advisory after the regression
passes and fails on any other high/critical advisory or audit failure.

When a patched upstream package ships, remove the mitigation and advisory exception,
upgrade the dependency, and keep the regression test. The Xcode tooling's uuid
is overridden to CommonJS-compatible 11.1.1; its project-ID generation is tested.
Both desktop and mobile dependency trees now have checked-in lockfiles and use
`npm ci` in CI.

## Desktop release

The macOS workflow accepts either App Store Connect Team API credentials or an
Apple ID app-specific password, preferring API credentials. It authenticates before
building, preserves both app and DMG bundles, verifies the app, submits and staples
the DMG, and checks Gatekeeper before uploading. Download URLs activate only after
successful verification. Windows still requires its own signing certificate.
