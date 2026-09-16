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

Remaining release operations require external credentials/accounts rather than application feature work:
- Apple signing + App Store Connect submission for iPhone/iPad.
- Google Play signing/submission for Android if Android is released.
- Production icon/splash artwork should be finalized before store submission.
- Push credentials are only required when push delivery is enabled; the current Notifications screen reads ICA cloud activity directly.
