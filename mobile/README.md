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

The default backend is `https://ica-unified.ryanedavis.workers.dev`.

## Security
The mobile login returns the same signed ICA session token format used by the web platform and the app stores it with Expo SecureStore. Mobile APIs are organization-scoped and validate membership on every request.

Before public App Store release, add the remaining production controls: native login abuse/rate limiting, App Store privacy metadata, production icons/splash assets, push-notification credentials, and Apple signing/App Store Connect configuration.
