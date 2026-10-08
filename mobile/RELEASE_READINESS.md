# ICA Unified release readiness — October 8, 2026

## Verified preparation
- App configuration points at `assets/icon.png`: 1024 × 1024, RGB, fully opaque.
- Bundle ID: `com.icomputeranything.icaunified`; iPhone and iPad enabled.
- Repository records App Store Connect app ID `6820198321`. Current listing/icon was not observed: the cloud browser reached a login page without an authenticated session.
- An earlier unsigned iOS archive compiled successfully. This does not establish a signed upload, TestFlight availability or App Store publication.
- The native Account + Privacy screen now submits account-deletion requests using the verified native bearer session. Invalid bearer credentials receive 401. Requests remain pending review, so this is not a complete deletion fulfillment system or a claim of Apple policy compliance.

## Signing and upload blockers
Latest signed upload run stopped before compilation, reporting these missing repository secrets:
1. `IOS_DISTRIBUTION_CERTIFICATE`
2. `IOS_DISTRIBUTION_CERTIFICATE_PASSWORD`
3. `IOS_PROVISIONING_PROFILE`
4. `APP_STORE_KEY_ID`
5. `APP_STORE_ISSUER_ID`
6. `APP_STORE_PRIVATE_KEY`

Configure credentials in repository secrets, never in source or chat. Unified needs an App Store provisioning profile for its own bundle. Do not reuse a Control or Director bundle profile.

## Before App Review
- Complete signed upload and verify the resulting build and icon inside App Store Connect.
- Test iPhone/iPad organization login, role restrictions, QR scanning, attendee check-in, member lookup, wallet, errors and sign-out.
- Test account-deletion request and fulfill deletion; check access for suspended/expired accounts and required data retention.
- Review privacy declarations against the final archive and all production processors; complete App Privacy, age rating, content rights and reviewer access in Connect.
- Capture actual native screenshots: Event Mode home, staff event selection/check-in, member QR, wallet and Account + Privacy. Use test data without personal details.
- Verify the existing native email/password sign-in behavior; web Google/Apple sign-in does not establish a native session.
- Run TestFlight before requesting App Review. Public release remains on hold.

## Android and Windows
- Android source and security checks exist; a Unified signed Android release and Play listing were not verified in this pass. A successful Control Android build does not establish Unified availability.
- Windows wrapper exists, but signed installer, installation behavior and Store account/listing must be verified independently.
- Reported registration payments alone do not prove developer enrollment, listing approval or release completion. Verify their destinations and account status before further purchases.
