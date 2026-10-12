import LegalPage, { LegalSection } from '../LegalPage';

export default function AccountDeletionPage() {
  return (
    <LegalPage eyebrow="ICA UNIFIED / CUSTOMER POLICY" title="Account & Data Deletion">
      <LegalSection title="Individual accounts">
        <p>Open Account &amp; Privacy in Unified or its mobile app to request account removal. Confirm that the request covers all your Unified workspace memberships. Requests are reviewed; the private status link shows progress and completion even after login access has been removed. A sole workspace owner must transfer ownership or have the workspace&apos;s separate closure request reviewed first.</p>
      </LegalSection>
      <LegalSection title="Organization workspaces">
        <p>An Organization Owner may request closure and deletion of the organization workspace through I Computer Anything support. ICA may require identity, ownership, and billing verification before deleting a tenant because deletion can affect other members, training records, credentials, documents, workflows, and organization history.</p>
      </LegalSection>
      <LegalSection title="What may be retained">
        <p>Records reasonably required for billing, fraud prevention, security, audit integrity, legal compliance, backups, disputes, or enforcement may be retained for the applicable period even after account or workspace deletion. Account login data is removed when account deletion completes. Limited training/compliance facts are archived without direct profile identifiers for 90 days, then automatically purged by scheduled cleanup. This archive excludes names, email, account IDs, certificate codes and free-text quiz answers. Outside-provider or organization-owned content is reviewed separately; required retention exceptions must be documented.</p>
      </LegalSection>
      <LegalSection title="How to request deletion">
        <p>Use Account &amp; Privacy to submit and confirm the request. Save the private status link. The review can show an expected completion date when known and confirms when removal is completed. Do not send passwords or authentication secrets. Workspace deletion is separate and does not happen automatically when an individual account is removed.</p>
      </LegalSection>
    </LegalPage>
  );
}
