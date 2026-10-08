# Microsoft login setup for the four ICA websites

Prepared 2026-10-08. Microsoft login is not enabled or verified yet.

## Current state

The web Microsoft login button and OAuth implementation exist in all four projects. Each backend enables its provider when both SOCIAL_MICROSOFT_CLIENT_ID and SOCIAL_MICROSOFT_CLIENT_SECRET are configured. These credentials are currently absent.

Azure portal home is accessible for the owner’s personal Microsoft account, but its directory list showed no available directories and Entra administration reported an access-token/sign-in error. No application registration or credentials have been created by this preparation.

## Application registration

Use an organization-controlled Microsoft Entra directory in which the owner can register applications. Do not register business applications in a university-controlled directory without confirming ownership and administrative permissions.

A single ICA application registration can contain the following four Web redirect URIs. Its supported account types must include accounts in any organizational directory and personal Microsoft accounts, matching the existing common OAuth endpoints. A suggested display name is "icomputeranything — Microsoft sign-in".

| Website | Cloudflare worker | Exact Web redirect URI |
| --- | --- | --- |
| ICA Unified | ica-unified | https://unified.icomputeranything.com/api/auth/social/microsoft/callback |
| ICA Control | ica-control-api | https://ica-control-api.ryanedavis.workers.dev/api/auth/social/microsoft/callback |
| Urban Director Studio | scenepilot | https://scenepilot.ryanedavis.workers.dev/api/auth/social/microsoft/callback |
| Urban Carrier OS | dispatchos-auth-api | https://dispatchos-auth-api.ryanedavis.workers.dev/auth/social/microsoft/callback |

These addresses match the current implementations and configuration. Do not replace them with guessed front-end addresses. Control can later use its verified branded API domain by setting SOCIAL_MICROSOFT_CALLBACK_ORIGIN and updating the registered redirect URI together.

Request only identity scopes used by the code: openid, profile, email. Do not add mail, files, contacts, or other Microsoft Graph privileges for login.

## Secure credential configuration

The owner completes Microsoft credential creation and any account verification. Do not paste passwords, one-time codes, or client-secret values into chat, source files, logs, or this document.

For each worker, configure:
- SOCIAL_MICROSOFT_CLIENT_ID: the registration’s Application (client) ID.
- SOCIAL_MICROSOFT_CLIENT_SECRET: the client-secret VALUE, saved as a Cloudflare secret.

The same registration can supply these credentials to all four workers. Record the secret expiration date outside source control and renew before expiry. Verify the production bindings survive the next deployment.

Do not expose an enabled Microsoft button with placeholder credentials.

## Existing access boundaries

Control currently permits Microsoft customer sign-in; privileged owner/admin social sign-in accepts Google and Apple only. Carrier’s platform-admin social sign-in is Google-only. Preserve these boundaries unless privileged Microsoft account linking is separately reviewed and explicitly approved.

These changes concern web sign-in. Do not claim native-app Microsoft authentication has been configured.

Carrier’s public return origin already falls back to https://redavi19-asu.github.io/icomputer-dispatch-platform; an absent PUBLIC_APP_ORIGIN binding is not itself a broken callback.

## Acceptance checks after real credentials are configured

For each website:
1. Provider readiness reports Microsoft enabled and the Microsoft button is visible.
2. Personal and work/school Microsoft sign-in return to the correct website without redirect mismatch.
3. New-user and returning-user flows produce the intended account and workspace memberships.
4. Cancelled or failed authorization has a useful error and no new authenticated session.
5. Existing privileged-account restrictions remain enforced.
6. Existing Google and Apple sign-in continue working.
7. Sign-out, account switching, session expiry, and access to protected pages behave correctly.

These live checks have not been performed. Source presence is not end-to-end verification.

## Windows signing is separate

Microsoft website sign-in does not sign Windows installers. Direct Windows installers need a trusted code-signing workflow. The existing PFX signing pipeline expects WINDOWS_CERTIFICATE and WINDOWS_CERTIFICATE_PASSWORD; Azure Artifact Signing is not integrated yet.

Artifact Signing requires a supported paid Azure subscription and publisher identity validation. Free, trial, and sponsored subscriptions are not supported. Microsoft Store MSIX distribution is re-signed by the Store; EXE/MSI installers need publisher signing. A valid signature does not guarantee that SmartScreen never displays a reputation warning.

No paid subscription, signing enrollment, certificate purchase, or public app release was performed as part of this preparation.

## Official documentation

- https://learn.microsoft.com/en-us/entra/identity-platform/quickstart-register-app
- https://learn.microsoft.com/en-us/entra/identity-platform/reply-url
- https://learn.microsoft.com/en-us/azure/artifact-signing/faq
- https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/code-signing-options
