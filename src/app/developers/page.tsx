import Link from "next/link";

export const metadata = { title: "Developer guide | ICA Unified" };
export default function Developers() {
  return (
    <main
      style={{
        maxWidth: 960,
        margin: "auto",
        padding: "48px 24px",
        lineHeight: 1.7,
      }}
    >
      <Link href="/">ICA Unified</Link>
      <h1>Connect your organization</h1>
      <p>
        Connect membership systems and registration forms to your Unified
        workspace. Each key belongs to one organization. Owners and admins
        manage keys and webhooks in Integrations.
      </p>
      <Link href="/workspace/integrations">Manage API keys and webhooks →</Link>
      <h2>Start with a private API key</h2>
      <ol>
        <li>Sign in as an organization owner or admin.</li>
        <li>
          Open Integrations and create a key with only the scopes your
          integration needs.
        </li>
        <li>
          Copy it once to your server’s secret storage. Never place it in
          browser code, a mobile app, a URL, or a public repository.
        </li>
        <li>
          Set an expiry. Rotate by creating a replacement, updating your server,
          and revoking the old key.
        </li>
      </ol>
      <pre
        style={{
          overflowX: "auto",
          padding: 20,
          background: "#eef2f6",
          color: "#102030",
        }}
      >{`curl 'https://unified.icomputeranything.com/api/v1/members' \\\n  -H "Authorization: Bearer $ICA_API_KEY"`}</pre>
      <h2>Member API</h2>
      <table>
        <thead>
          <tr>
            <th>Request</th>
            <th>Scope</th>
            <th>Behavior</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>GET /api/v1/members</td>
            <td>members:read</td>
            <td>Returns up to 500 members of the key’s organization.</td>
          </tr>
          <tr>
            <td>POST /api/v1/members</td>
            <td>members:write</td>
            <td>
              Creates an invitation. The person must accept it to activate
              membership.
            </td>
          </tr>
        </tbody>
      </table>
      <pre style={{ overflowX: "auto" }}>
        {JSON.stringify(
          {
            name: "Example Member",
            email: "member@example.com",
            jobTitle: "Coordinator",
            role: "MEMBER",
          },
          null,
          2,
        )}
      </pre>
      <p>
        POST returns 201 with an invitation ID, activation URL, and expiry.
        Treat activation URLs as private. A duplicate organization membership
        returns 409. Invalid input returns 400; missing, revoked, or expired
        keys return 401; missing scopes return 403; inactive subscription access
        returns 402; rate limits return 429 with Retry-After. Respect the key’s
        configured request limit.
      </p>
      <h2>Signed webhooks</h2>
      <p>
        Add an HTTPS receiver in Integrations and copy its signing secret once.
        Select the events you need: member.invited, member.activated,
        migration.members.completed, event.registration.received,
        membership.application.received, and workflow.submission.updated. Use
        Send test event to check delivery before relying on it.
      </p>
      <p>
        Requests contain X-ICA-Event and X-ICA-Signature. Verify the HMAC-SHA256
        of the exact raw request body with your webhook secret and compare it in
        constant time against the hex value after sha256=. Decode JSON only
        after verification. Store event IDs to ignore duplicates.
      </p>
      <pre style={{ overflowX: "auto" }}>
        {JSON.stringify(
          {
            id: "event-id",
            event: "member.invited",
            createdAt: "ISO-8601 timestamp",
            data: { invitationId: "invitation-id" },
          },
          null,
          2,
        )}
      </pre>
      <p>
        Return a 2xx response promptly. Delivery has an eight-second timeout and
        redirects are rejected. Current delivery is a single attempt with the
        latest result shown in Integrations; automatic retries are not yet
        provided. Reconcile member records with the API after a missed event.
        These webhook secrets are separate from Stripe webhook credentials.
      </p>
      <h2>Commercial access</h2>
      <p>
        The API follows your organization’s Unified subscription access. An API
        key does not grant access to another company or to ICA’s Stripe account.
        Additional endpoints and custom integrations require a separate scope
        agreement.
      </p>
    </main>
  );
}
