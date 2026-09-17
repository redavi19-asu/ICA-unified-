import LegalPage, { LegalSection } from '../LegalPage';

export default function TermsPage() {
  return (
    <LegalPage eyebrow="ICA UNIFIED / CUSTOMER POLICY" title="Terms of Service">
      <LegalSection title="Service">
        <p>ICA Unified is a business software platform provided by I Computer Anything for organization management, learning, credentials, compliance, controlled documents, workflows, reporting, integrations, and related operations.</p>
      </LegalSection>
      <LegalSection title="Organization responsibility">
        <p>The customer organization is responsible for the accuracy and legality of information it enters into ICA Unified, the users it authorizes, the roles it assigns, and the business decisions it makes using the platform.</p>
      </LegalSection>
      <LegalSection title="Accounts and access">
        <p>Users must protect account credentials and may only access organizations and records they are authorized to use. Customers must promptly remove or suspend access that is no longer appropriate.</p>
      </LegalSection>
      <LegalSection title="Subscription and payment">
        <p>ICA Unified Professional is billed at the price shown during checkout. The current standard Professional price is $299 per month after the 14-day trial. Taxes, custom implementation, migration, consulting, or other separately quoted services may be additional.</p>
        <p>Recurring subscription payments are processed by Stripe. Customer organizations may separately connect Stripe for their own member dues or event payments; those customer transactions are separate from the ICA Unified software subscription.</p>
      </LegalSection>
      <LegalSection title="Acceptable use">
        <p>Customers may not use ICA Unified to break the law, access another organization without authorization, distribute malware, interfere with platform security, abuse service resources, or intentionally submit fraudulent or harmful content.</p>
      </LegalSection>
      <LegalSection title="Third-party services">
        <p>Features that connect to third-party services depend on those providers remaining available and properly configured. I Computer Anything is not responsible for outages, policy changes, or failures caused solely by an external provider outside ICA Unified's control.</p>
      </LegalSection>
      <LegalSection title="Availability and changes">
        <p>I Computer Anything may maintain, secure, repair, update, or improve ICA Unified as needed. Reasonable efforts are made to preserve customer access and data, but uninterrupted or error-free operation cannot be guaranteed.</p>
      </LegalSection>
      <LegalSection title="Cancellation">
        <p>Organizations can manage or cancel their subscription through Workspace → Billing → Manage or Cancel Subscription. The current cancellation and billing rules are published on the Cancellation & Billing page and form part of these terms.</p>
      </LegalSection>
      <LegalSection title="Support and contact">
        <p>Standard product support covers use and troubleshooting of existing ICA Unified features. Custom development, migration, dedicated training, consulting, or special integrations may require a separate scope and fee.</p>
      </LegalSection>
    </LegalPage>
  );
}
