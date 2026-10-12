# Unified customer and administrator directions

Updated October 12, 2026 against the shipped web application. Native source changes still require a signed release and device testing.

## Sign in and get started

1. Use the Unified customer sign-in for an organization membership. ICA platform administrators use the separate `/platform/login` entrance; a platform account is not a customer membership.
2. New organizations start through registration; their first customer is OWNER. Invited people use their private activation link to join. Creating an invitation alone does not activate membership.
3. Organization owners/admins manage People, Tools and Integrations according to their role. Members use their assigned learning, documents and wallet. An API key does not bypass organization or subscription access.
4. Web social sign-in uses the configured Google, Apple or Microsoft provider. Verify each provider separately. Native organization sign-in currently uses email/password; web social sign-in does not establish a native session.

## Everyday work

- **Workflows:** create membership programs or events/webinars, configure details and approval/confirmation settings, then activate to obtain their public page. Paid workflows require the organization's ready Stripe Connect account. Company SaaS billing is separate from member/event payments.
- **People:** manage organization membership and invitations. Treat invitation URLs as private.
- **Learning:** create lessons/quizzes, assign courses and track completion. Configure course credit rules under Compliance; completion can issue credentials and CE credits.
- **Compliance:** configure CE requirements and event QR attendance. Members use My Credential + CE Wallet for credits, credentials and renewal readiness.
- **Documents:** publish controlled text/files and track member acknowledgments. **Reports** provides organization reporting.
- **Tools:** upload a member CSV, map fields, inspect the preview and confirm before importing. **Integrations → Export + Backup** provides member CSV and organization JSON export; password hashes are excluded.
- **ICA Assist:** ask for navigation and current feature directions. Help does not perform deletion, verify identity or establish that a payment/provider is live.

## API keys and webhooks

1. As an owner/admin, open Integrations. Create only the required API scopes and set an expiry. Copy the key once to server-side secret storage; never place it in browser/mobile code or URLs.
2. Use Bearer authentication. The API now covers members, courses/lessons, learner assignments and progress, credentials, CE transcripts, events/registrations/attendance, and membership applications/status. Existing keys keep their old scopes; create a replacement with the added permissions when needed. Member POST creates an invitation for acceptance; new API writes require an Idempotency-Key and retain replay receipts for 24 hours. Rotate by creating a replacement, updating your integration and revoking the old key.
3. Add an HTTPS webhook receiver, copy its secret once and choose events. Use **Send test event** to check delivery.
4. Verify HMAC-SHA256 over the exact raw body against `X-ICA-Signature`; process only after verification and deduplicate `X-ICA-Event-ID`. Return 2xx promptly; requests time out after eight seconds and redirects are rejected.
5. Saved deliveries retry network errors, timeouts, HTTP 408/425/429 and 5xx, up to eight attempts within 24 hours. The scheduled worker checks every five minutes. Other non-2xx responses stop delivery. Disabled/deleted endpoints are not retried.
6. Inspect pending/failed counts in Integrations. Repair your receiver and reconcile failed/expired events through the relevant API. Use course.completed, credential.issued, event.attendance.recorded and membership.application.decided for the new workflows. There is no manual retry button. Successful payloads clear immediately; failed payloads expire after seven days. Webhook secrets are separate from Stripe credentials.

See the public [developer guide](https://unified.icomputeranything.com/developers) for request bodies, events, pagination, idempotent writes, response codes and access rules. API scopes do not allow invented course completion, paid access or membership approval. Staff review and checkout use the existing workflow.

## Customer account deletion

1. Open **Account & Privacy** at `/workspace/account`. Read the notice: personal account deletion removes all Unified workspace memberships, not just the workspace currently selected.
2. Type `DELETE`, choose **REQUEST ACCOUNT DELETION** and save the private status/completion link. Keep that link private. Older requests may require confirmation again to authorize account-wide removal.
3. Check review updates on Account & Privacy or the saved link. ICA may request information; an expected date is a review estimate, not immediate removal.
4. At reviewed completion, personal account access, memberships and owned API credentials are removed. Limited de-identified training/compliance facts are retained for exactly **90 days after completion**, then automatically purged. The private receipt shows completion and archive expiry; its access expires 30 days after archive expiry.
5. Sole owners must arrange ownership transfer or separate workspace closure review. Do not assume a self-service owner-transfer button exists. Apple-linked legacy users may need to sign in with Apple again on the web so authorization can be revoked.
6. Workspace closure and company billing cancellation are separate reviews. Account deletion does not silently delete company courses/documents, close a workspace or cancel billing. Uploaded/shared/free-text and outside-provider data require review; retained exceptions must be documented.

Privacy requests remain available to authenticated users in unpaid/cancelled organizations; suspended memberships do not regain access. Use the current web flow if an installed native app lacks updated confirmation/status features.

## ICA administrator completion

Only active MASTER/PLATFORM_ADMIN accounts can review or complete personal-account requests. SUPPORT and customer organization administrators cannot use this queue.

1. Sign in through `/platform/login`; open `/platform/deletion-requests`.
2. Select **Review scope and ownership**. Inspect memberships, record counts, consent, last-owner and Apple reconnection warnings. Workspace requests require separate closure review; this screen does not implement workspace removal.
3. Save an **Under review** update visible to the customer. Use **Needs information** when facts or authorization are missing. Set an expected completion date only when justified.
4. Verify the account holder's request and identity. Review uploaded/shared content, free-text records and outside-provider data; remove required personal data and document exceptions. Do not check attestations before completing that review.
5. Resolve consent, ownership, protected platform-account and Apple authorization blockers. Type the exact request ID and choose **Complete account removal** only after the review checks are true.
6. Completion removes account data in one atomic D1 batch; a database failure rolls it back. Confirm the completion message and expiry date. The customer uses their private receipt after sign-out. Existing pending requests are not processed automatically.

## Release boundaries

The reviewed deletion flow and webhook recovery are deployed on the web. No real customer account was deleted during release verification. Native source is updated but not published by these web deployments. Signed iOS upload, real-device testing, provider consent testing and App Store review remain separate gates. Live payment activation/testing is a separate task and must not be inferred from these directions.
