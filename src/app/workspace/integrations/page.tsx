import { redirect } from 'next/navigation';
import { requireSession } from '../../../lib/auth';
import IntegrationsClient from './IntegrationsClient';

export default async function IntegrationsPage() {
  const { membership } = await requireSession();
  if (!['OWNER', 'ADMIN'].includes(membership.role)) redirect('/workspace');

  return (
    <IntegrationsClient
      organizationName={membership.organization.name}
      organizationSlug={membership.organization.slug}
    />
  );
}
