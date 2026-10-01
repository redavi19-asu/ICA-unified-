import LegalPage, { LegalSection } from '../LegalPage';

export default function AccountDeletionPage() {
  return (
    <LegalPage eyebrow="ICA UNIFIED / CUSTOMER POLICY" title="Account & Data Deletion">
      <LegalSection title="Individual accounts">
        <p>People whose ICA Unified access is controlled by an organization should first ask that organization's Owner or Administrator to remove their membership. A user may also contact I Computer Anything for a privacy or deletion review when appropriate.</p>
      </LegalSection>
      <LegalSection title="Organization workspaces">
        <p>An Organization Owner may request closure and deletion of the organization workspace through I Computer Anything support. ICA may require identity, ownership, and billing verification before deleting a tenant because deletion can affect other members, training records, credentials, documents, workflows, and organization history.</p>
      </LegalSection>
      <LegalSection title="What may be retained">
        <p>Records reasonably required for billing, fraud prevention, security, audit integrity, legal compliance, backups, disputes, or enforcement may be retained for the applicable period even after account or workspace deletion. Other customer data is deleted or de-identified according to the Privacy Policy and operational retention process.</p>
      </LegalSection>
      <LegalSection title="How to request deletion">
        <p>Use the I Computer Anything contact channel and identify the ICA Unified organization and account involved. Do not send passwords or authentication secrets. ICA may request additional verification before completing the request.</p>
      </LegalSection>
    </LegalPage>
  );
}
