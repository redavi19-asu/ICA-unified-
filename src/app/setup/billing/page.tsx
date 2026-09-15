import { redirect } from 'next/navigation';
import { requireSession } from '../../../lib/auth';
import { ensureBillingProfile, PROFESSIONAL_PRICE_CENTS } from '../../../lib/organization-ops';
import { isStripeCheckoutConfigured, isStripeEntitledStatus } from '../../../lib/stripe-billing';
import BillingSetupClient from './BillingSetupClient';

export default async function BillingSetupPage({
  searchParams,
}: {
  searchParams: Promise<{ cancelled?: string; confirm?: string }>;
}) {
  const { membership } = await requireSession();
  const params = await searchParams;
  if (!['OWNER', 'ADMIN'].includes(membership.role)) redirect('/workspace');

  if (membership.organization.plan === 'internal' || membership.organization.slug === 'ica-master') {
    redirect('/workspace');
  }

  const billing = await ensureBillingProfile(membership.organizationId);
  if (isStripeEntitledStatus(billing?.subscriptionStatus || '')) redirect('/downloads');

  return (
    <BillingSetupClient
      organizationName={membership.organization.name}
      companyId={membership.organization.slug.toUpperCase()}
      monthlyPrice={PROFESSIONAL_PRICE_CENTS / 100}
      stripeReady={isStripeCheckoutConfigured()}
      cancelled={params.cancelled === '1'}
      confirmationFailed={params.confirm === 'failed'}
    />
  );
}
