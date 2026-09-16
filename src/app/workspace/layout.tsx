import { requireSession } from '../../lib/auth';
import { prisma } from '../../lib/prisma';
import WorkspaceShellClient from './WorkspaceShellClient';
import { redirect } from 'next/navigation';
import { ensureBillingProfile } from '../../lib/organization-ops';
import { isStripeCheckoutConfigured, isStripeEntitledStatus } from '../../lib/stripe-billing';

export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const { membership } = await requireSession();

  if (
    membership.organization.plan !== 'internal' &&
    membership.organization.slug !== 'ica-master'
  ) {
    const billing = await ensureBillingProfile(membership.organizationId);
    const localTrialExpired =
      membership.organization.status === 'TRIAL' &&
      Boolean(membership.organization.trialEndsAt && membership.organization.trialEndsAt.getTime() <= Date.now());

    if (isStripeCheckoutConfigured()) {
      if (!isStripeEntitledStatus(billing?.subscriptionStatus || '')) {
        redirect('/setup/billing');
      }
    } else if (localTrialExpired) {
      redirect('/setup/billing?trial=expired');
    }
  }

  const platformAdmin = await prisma.platformAdmin.findUnique({
    where: { email: membership.user.email.toLowerCase() },
    select: { role: true, active: true },
  });

  return (
    <WorkspaceShellClient
      role={membership.role}
      platformRole={platformAdmin?.active ? platformAdmin.role : null}
    >
      {children}
    </WorkspaceShellClient>
  );
}
