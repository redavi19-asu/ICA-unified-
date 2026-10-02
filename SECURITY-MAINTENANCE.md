# Dependency and release security maintenance

CI audits the complete web dependency tree, including development and optional
packages. Do not restore `--omit=optional`: Prisma's optional dependencies were
previously excluded from the security gate.

The Prisma 6 configuration dependency is overridden to `deepmerge-ts` 8.0.2 to
address GHSA-ggr8-5vv4-36mx. This follows the same plain-object merge compatibility
analysis used by Prisma's upstream fix: https://github.com/prisma/orm/pull/30189.
Prisma generation, schema validation and the production build remain required.

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
