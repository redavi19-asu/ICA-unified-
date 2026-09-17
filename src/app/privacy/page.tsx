import LegalPage, { LegalSection } from '../LegalPage';

export default function PrivacyPage() {
  return (
    <LegalPage eyebrow="ICA UNIFIED / CUSTOMER POLICY" title="Privacy Policy">
      <LegalSection title="What ICA Unified collects">
        <p>ICA Unified stores account and organization information needed to operate the service, including names, work email addresses, organization identifiers, roles, membership records, training activity, credentials, controlled-document acknowledgments, workflow submissions, event records, and configuration data supplied by the organization.</p>
        <p>Payment card details are handled by Stripe. ICA Unified does not store raw card numbers.</p>
      </LegalSection>
      <LegalSection title="How information is used">
        <p>Information is used to authenticate users, operate organization workspaces, deliver learning and compliance features, process organization workflows, provide support, maintain security, send service communications, and improve reliability.</p>
      </LegalSection>
      <LegalSection title="Organization data boundaries">
        <p>Customer data is scoped to the organization workspace associated with the record. Role-based access controls determine which authorized users can view or change information inside that workspace.</p>
      </LegalSection>
      <LegalSection title="Service providers">
        <p>ICA Unified may use service providers such as Cloudflare for application infrastructure, Stripe for billing and payments, and configured email or media providers. Those providers process information needed to perform their services under their own terms and privacy commitments.</p>
      </LegalSection>
      <LegalSection title="Retention and deletion">
        <p>Operational data is generally retained while an organization account is active and for a reasonable period afterward for account recovery, security, legal, billing, backup, and audit purposes. An organization may request an export or deletion review through I Computer Anything support. Some information may be retained when required for legal, financial, security, or fraud-prevention reasons.</p>
      </LegalSection>
      <LegalSection title="Security">
        <p>ICA Unified uses tenant-scoped access controls, signed sessions, rate limiting, bot protection on public authentication paths, password hashing, and other safeguards intended to protect customer information. No internet service can guarantee absolute security.</p>
      </LegalSection>
      <LegalSection title="Questions or requests">
        <p>Privacy, access, export, correction, and deletion requests can be submitted through the I Computer Anything contact channel. Requests may require identity and organization verification before action is taken.</p>
      </LegalSection>
    </LegalPage>
  );
}
