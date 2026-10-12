import Link from "next/link";
import { API_ENDPOINTS, API_SCOPES } from "../../lib/api-contract";

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
      <h2>Available permissions</h2>
      <p>
        Use your existing Unified organization account. Only owners/admins can
        create keys in Integrations. Select the required permissions and expiry.
        Existing keys keep their member permissions; create a replacement with
        the new scopes when expanding an integration.
      </p>
      <p>{API_SCOPES.join(", ")}</p>
      <h2>Learning, credentials, events and applications</h2>
      <div style={{ overflowX: "auto" }}>
        <table>
          <thead>
            <tr>
              <th>Request</th>
              <th>Scope</th>
              <th>Purpose</th>
            </tr>
          </thead>
          <tbody>
            {API_ENDPOINTS.map(([request, scope, purpose]) => (
              <tr key={request}>
                <td>
                  <code>{request}</code>
                </td>
                <td>{scope}</td>
                <td>{purpose}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p>
        List endpoints return <code>data</code> and <code>nextCursor</code>. Use{" "}
        <code>?limit=100</code> (1–100) and pass <code>nextCursor</code> as{" "}
        <code>?after=</code>. Enrollments can filter by userId/courseId;
        credentials and credits can filter by userId. IDs and results always
        belong to the key’s organization. Member listing includes userId for
        learner assignments.
      </p>
      <h3>Safe writes and retries</h3>
      <p>
        Every new POST endpoint above requires an <code>Idempotency-Key</code>{" "}
        of 8–100 letters, digits, underscores or hyphens. Reuse the same key and
        input when a response is lost. Receipts last 24 hours: new writes return
        201, replay returns 200 with replayed=true; changed input returns 409.
        Database writes, the receipt and API webhook records commit together.
        JSON bodies are limited to 64 KiB; unknown fields return 400. No
        endpoint accepts a company ID to override the key’s organization.
      </p>
      <h3>Create a course and assign a learner</h3>
      <pre style={{ overflowX: "auto" }}>
        {JSON.stringify(
          {
            title: "Safety training",
            description: "Annual refresher",
            passingScore: 80,
            published: true,
          },
          null,
          2,
        )}
      </pre>
      <p>
        POST this to <code>/api/v1/courses</code>; the response supplies id. Add
        lessons at <code>/api/v1/courses/COURSE_ID/lessons</code> with an
        explicit unique order:
      </p>
      <pre style={{ overflowX: "auto" }}>
        {JSON.stringify(
          {
            title: "Safety introduction",
            kind: "TEXT",
            content: "Read the safety instructions.",
            order: 1,
          },
          null,
          2,
        )}
      </pre>
      <p>
        Lesson kinds: TEXT, VIDEO, DOCUMENT, QUIZ, LIVE. Optional mediaUrl must
        use HTTPS; LIVE requires it. QUIZ requires question, options (2–6) and
        correctAnswer matching an option. Read responses omit correct answers.
        Course fields also support durationMin, required and
        certificateValidDays. Assign with:
      </p>
      <pre style={{ overflowX: "auto" }}>
        {JSON.stringify(
          {
            courseId: "COURSE_ID",
            userId: "USER_ID",
            dueAt: "2026-12-31T23:59:59Z",
          },
          null,
          2,
        )}
      </pre>
      <p>
        POST assignments to <code>/api/v1/enrollments</code>. Members must be
        active. Reassignment updates dueAt without resetting progress or
        completion; omit dueAt to clear it. Learners complete lessons/quizzes in
        Unified. This API reads progress and issued credentials; it does not let
        integrations invent completion, passing scores or CE credits. Use
        course.completed and credential.issued webhooks, then retrieve the
        authoritative records.
      </p>
      <h3>Create events and register attendees</h3>
      <pre style={{ overflowX: "auto" }}>
        {JSON.stringify(
          {
            name: "Annual conference",
            status: "ACTIVE",
            startAt: "2026-12-01T12:00:00Z",
            capacity: 100,
            price: 0,
            ceuCredits: 2,
            creditCategory: "GENERAL",
            checkinMode: "BOTH",
            certificateRule: "ATTENDANCE",
          },
          null,
          2,
        )}
      </pre>
      <p>
        POST to <code>/api/v1/events</code>. The default status is DRAFT; use
        ACTIVE when ready. Optional endAt must follow startAt; meetingLink must
        use HTTPS. Price is in currency units and configures the existing
        workflow; API creation does not collect money or enable payments.
      </p>
      <pre style={{ overflowX: "auto" }}>
        {JSON.stringify(
          {
            name: "Example attendee",
            email: "attendee@example.com",
            phone: "",
            company: "Example company",
            notes: "Accessibility request",
          },
          null,
          2,
        )}
      </pre>
      <p>
        POST to <code>/api/v1/events/EVENT_ID/registrations</code>. Capacity
        assigns REGISTERED, WAITLISTED or PAYMENT_PENDING according to the
        workflow. Repeated workflow/email registration with a different request
        key returns 409. Staff review and checkout stay in the existing Unified
        workflow; the API cannot mark payments paid.
      </p>
      <p>
        For attendance, POST <code>{'{"userId":"USER_ID"}'}</code> to{" "}
        <code>/api/v1/events/EVENT_ID/attendance</code> using attendance:write.
        The member must be active and have a REGISTERED submission; paid events
        require confirmed payment. Attendance awards only the event’s configured
        credits/certificate, once. Duplicate attendance does not issue another
        award. A scoped integration is an authorized attendance recorder; give
        this permission only to trusted staff systems.
      </p>
      <h3>Membership applications</h3>
      <p>
        GET <code>/api/v1/applications</code> to find membership program IDs
        created in Workflows. Submit the same name/email/contact fields to{" "}
        <code>/api/v1/applications/PROGRAM_ID/submissions</code>. The program
        must be active. GET that endpoint to check decisions/payment status.
        Approval rules and payment requirements remain enforced; the API cannot
        approve an application or activate a membership. Staff completes
        review/activation through Workflows, including already-approved free
        submissions.
      </p>
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
        membership.application.received, workflow.submission.updated,
        course.created, course.assigned, course.completed, credential.issued,
        event.created, event.attendance.recorded, and
        membership.application.decided. Use Send test event to check delivery
        before relying on it.
      </p>
      <p>
        Requests contain X-ICA-Event, X-ICA-Event-ID, and X-ICA-Signature.
        Verify the HMAC-SHA256 of the exact raw request body with your webhook
        secret and compare it in constant time against the hex value after
        sha256=. Decode JSON only after verification. Store event IDs to ignore
        duplicates.
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
        redirects are rejected. Events are saved before sending. Network errors,
        timeouts, HTTP 408/425/429 and 5xx responses are retried with increasing
        delays, up to eight attempts within 24 hours. A background worker checks
        due deliveries every five minutes. Other non-2xx responses stop
        delivery. Retries retain the same event ID and raw payload; delivery is
        at least once, so receivers must ignore IDs already processed. Removed
        or disabled endpoints are not retried. Integrations shows pending and
        failed delivery counts. Failed payloads are removed after seven days;
        successfully delivered payloads are cleared immediately. Reconcile
        records through the member API if delivery expires or permanently fails.
        These webhook secrets are separate from Stripe webhook credentials.
      </p>
      <p>
        New API writes queue their notifications for the scheduled worker
        (normally checked within five minutes). Course completion and existing
        workflow actions also emit notifications. Treat each notification as a
        signal to retrieve current records; API and webhook credentials are
        separate. Application-decision events report the decision but do not
        grant payment or membership access.
      </p>
      <h2>Commercial access</h2>
      <p>
        Software subscription eligibility still applies. The separate API launch plan is $99/month for 100,000 requests per organization per billing period. Billing is not active yet; no automatic overage charges apply. When paid API access launches, the organization will need that additional subscription, managed in Integrations. An API
        key does not grant access to another company or to ICA’s Stripe account.
        Additional endpoints and custom integrations require a separate scope
        agreement.
      </p>
    </main>
  );
}
