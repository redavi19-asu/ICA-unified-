import { redirect } from 'next/navigation';
import { requireSession } from '../../../lib/auth';
import { ensureBillingProfile, PROFESSIONAL_PRICE_CENTS } from '../../../lib/organization-ops';
import { isStripeCheckoutConfigured, isStripeEntitledStatus } from '../../../lib/stripe-billing';
import BillingSetupClient from './BillingSetupClient';

export default async function BillingSetupPage() {
  const { membership } = await requireSession();
  if (!['OWNER', 'ADMIN'].includes(membership.role)) redirect('/workspace');

  if (membership.organization.plan === 'internal' || membership.organization.slug === 'ica-master') {
    redirect('/workspace');
  }

  const billing = await ensureBillingProfile(membership.organizationId);
  if (isStripeEntitledStatus(billing?.subscriptionStatus || '')) redirect('/downloads');

  return (
    <BillingSetupClient
      organizationName={membership.organization.name}
      monthlyPrice={PROFESSIONAL_PRICE_CENTS / 100}
      stripeReady={isStripeCheckoutConfigured()}
    />
  );
}
