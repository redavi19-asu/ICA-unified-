import LegalPage, { LegalSection } from '../LegalPage';

export default function CancellationPage() {
  return (
    <LegalPage eyebrow="ICA UNIFIED / CUSTOMER POLICY" title="Cancellation & Billing">
      <LegalSection title="14-day trial">
        <p>New ICA Unified Professional organizations receive a 14-day trial when the trial is offered during checkout. Cancel before the trial ends to avoid the first recurring subscription charge.</p>
      </LegalSection>
      <LegalSection title="Monthly subscription">
        <p>After the trial, ICA Unified Professional renews monthly at the subscription price shown at checkout. The current standard Professional price is $299 per month.</p>
      </LegalSection>
      <LegalSection title="How to cancel">
        <p>An organization Owner or Admin can open Workspace → Billing → Manage or Cancel Subscription. ICA then opens the secure Stripe customer billing portal for that organization.</p>
      </LegalSection>
      <LegalSection title="When cancellation takes effect">
        <p>For a paid monthly subscription, cancellation is scheduled for the end of the current paid billing period. Access remains available through that paid period unless the account is suspended for security, misuse, or another valid account-control reason.</p>
      </LegalSection>
      <LegalSection title="Refunds and billing errors">
        <p>Charges already processed are generally not automatically refunded simply because a subscription is canceled. Billing errors, duplicate charges, or exceptional circumstances can be submitted to I Computer Anything for review. Any refund required by applicable law will be honored.</p>
      </LegalSection>
      <LegalSection title="Data after cancellation">
        <p>Cancellation stops future subscription renewals but does not automatically erase organization records. Customers should export needed data before access ends. Data deletion requests can be submitted separately and are handled according to the Privacy Policy and applicable retention requirements.</p>
      </LegalSection>
    </LegalPage>
  );
}
