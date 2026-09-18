import { redirect } from 'next/navigation';
import { requireSession } from '../../../lib/auth';
import { confirmCheckoutForOrganization } from '../../../lib/stripe-billing';

export default async function SetupCompletePage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string }>;
}) {
  const { membership } = await requireSession({ allowUnentitled: true });
  const { session_id } = await searchParams;
  if (!session_id) redirect('/setup/billing');

  try {
    await confirmCheckoutForOrganization(membership.organizationId, session_id);
  } catch (error) {
    console.error('ICA_STRIPE_CONFIRM_ERROR', error);
    redirect('/setup/billing?confirm=failed');
  }

  redirect('/downloads?welcome=1');
}
