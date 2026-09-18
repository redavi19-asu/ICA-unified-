import { redirect } from 'next/navigation';
import { requireSession } from '../../../lib/auth';
import { ensureBillingProfile, PROFESSIONAL_PRICE_CENTS } from '../../../lib/organization-ops';
import { isStripeCheckoutConfigured, isStripeEntitledStatus } from '../../../lib/stripe-billing';
import BillingSetupClient from './BillingSetupClient';

export default async function BillingSetupPage({
  searchParams,
}: {
  searchParams: Promise<{ cancelled?: string; confirm?: string; trial?: string }>;
}) {
  const { membership } = await requireSession({ allowUnentitled: true });
  const params = await searchParams;
  if (!['OWNER', 'ADMIN'].includes(membership.role)) redirect('/workspace');

  if (membership.organization.plan === 'internal' || membership.organization.slug === 'ica-master') {
    redirect('/workspace');
  }

  const billing = await ensureBillingProfile(membership.organizationId);
  if (isStripeEntitledStatus(billing?.subscriptionStatus || '')) redirect('/downloads');

  const subscriptionStatus = String(billing?.subscriptionStatus || '').toLowerCase();
  const manageExistingSubscription = Boolean(
    billing?.providerCustomerId &&
    billing?.providerSubscriptionId &&
    !['', 'not_connected', 'canceled', 'incomplete_expired'].includes(subscriptionStatus)
  );

  return (
    <BillingSetupClient
      organizationName={membership.organization.name}
      companyId={membership.organization.slug.toUpperCase()}
      monthlyPrice={PROFESSIONAL_PRICE_CENTS / 100}
      stripeReady={isStripeCheckoutConfigured()}
      manageExistingSubscription={manageExistingSubscription}
      cancelled={params.cancelled === '1'}
      confirmationFailed={params.confirm === 'failed'}
      trialExpired={params.trial === 'expired'}
    />
  );
}
