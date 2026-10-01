import LegalPage, { LegalSection } from '../LegalPage';

export default function AcceptableUsePage() {
  return (
    <LegalPage eyebrow="ICA UNIFIED / CUSTOMER POLICY" title="Acceptable Use Policy">
      <LegalSection title="Authorized business use">
        <p>ICA Unified may be used for lawful organization management, learning, credentials, documents, workflows, communications, reporting, payments, and related business operations.</p>
      </LegalSection>
      <LegalSection title="Prohibited use">
        <p>Customers may not use ICA Unified to access another organization without authorization, distribute malware, bypass security controls, harass or impersonate others, submit fraudulent records, infringe intellectual-property or privacy rights, interfere with service availability, evade limits, or conduct unlawful or deceptive activity.</p>
      </LegalSection>
      <LegalSection title="Organization responsibility">
        <p>Customer organizations are responsible for the people they invite, the roles and permissions they assign, the content and records they upload, and any notices or consents required for employees, contractors, students, members, or other people represented in their workspace.</p>
      </LegalSection>
      <LegalSection title="Enforcement">
        <p>I Computer Anything may restrict, suspend, or revoke access when reasonably necessary to address abuse, security risk, legal requirements, or threats to the service or another customer.</p>
      </LegalSection>
    </LegalPage>
  );
}
