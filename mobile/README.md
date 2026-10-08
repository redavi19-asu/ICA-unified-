# ICA Unified Mobile

Native iPhone/iPad event companion for ICA Unified.

## Purpose
The desktop/web product operates the organization. The mobile app is optimized for event-floor work:
- QR event check-in
- member lookup for staff
- CE and credential wallet
- recent organization/member activity
- same ICA Unified organization data and permissions

## Development
1. Use Node 22.13+.
2. Run `npm install` in this folder.
3. Run `npx expo start`.
4. Set `EXPO_PUBLIC_ICA_API_URL` only if testing against a non-production ICA backend.

The default production backend is `https://unified.icomputeranything.com`.

## Security
The mobile login returns the same signed ICA session token format used by the web platform and the app stores it with Expo SecureStore. Mobile APIs are organization-scoped and validate membership on every request.

Production controls already in the codebase include native login rate limiting, SecureStore session storage, iOS privacy/export metadata, production API targeting, and EAS build profiles.

External release operations still include:
- Apple signing + App Store Connect submission for iPhone/iPad.
- Google Play signing/submission for Android if Android is released.
- The mobile icon and launch image reuse the existing ICA Unified artwork in `assets/icon.png`.
- Push credentials are only required when push delivery is enabled; the current Notifications screen reads ICA cloud activity directly.

## Apple release preparation (October 7, 2026)

- App Store Connect app: **ICA Unified**, Apple ID **6820198321**.
- Bundle identifier: `com.icomputeranything.icaunified`; SKU: `ICA-UNIFIED-IOS-001`.
- One app supports iPhone and iPad, including rotation. Native Expo app uses the existing production backend.
- Run `npm ci`, `npm run typecheck`, `npm run audit:security`, and `npm run ios:prepare` inside `mobile` on the Mac with Xcode installed.
- Open `ios/ICAUnified.xcworkspace`, choose the existing Apple development team, configure signing for this bundle, test on iPhone and iPad, then Archive, Validate, and upload with Xcode Organizer.
- The `ICA Unified iOS Archive` workflow compiles an unsigned archive. An unsigned archive is not an installable release and is not uploaded to Apple.
- Signing certificate/profile and App Store upload authentication must belong to Unified's bundle. A Control or Director provisioning profile cannot sign Unified.

### Remaining release gates

1. Verify native organization sign-in and real-device event QR/member check-in, wallet, and error recovery. Native login currently uses email/password; Google/Apple/Microsoft web sign-in does not yet create a native session.
2. Test the native Account + Privacy screen and its authenticated account-deletion request. The route accepts verified native bearer sessions and scopes requests to the current membership. Requests remain pending review; verify the actual deletion fulfillment process and access for expired/suspended accounts before claiming Apple policy compliance.
3. Verify roles and access for organization accounts and platform-owner routing; the mobile event companion currently targets organization memberships.
4. Review the six privacy data categories against production providers and SDK manifests, then complete Apple's age rating, content-rights, privacy, and review metadata.
5. Capture real iPhone/iPad screenshots and an appropriately scoped reviewer account.
6. Upload a signed native build and perform TestFlight checks before App Review.

Privacy metadata describes names, email addresses, user IDs, user content, product interaction, and diagnostic data used for app functionality and linked to accounts. The QR camera processes scans locally; audio recording is disabled. Provider/SDK aggregation must still be checked in the compiled archive.
