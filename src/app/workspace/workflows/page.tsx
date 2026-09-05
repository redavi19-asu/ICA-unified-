import { redirect } from 'next/navigation';
import { requireSession } from '../../../lib/auth';
import WorkflowStudioClient from './WorkflowStudioClient';

export default async function WorkflowsPage() {
  const { membership } = await requireSession();

  if (!['OWNER', 'ADMIN', 'MANAGER'].includes(membership.role)) {
    redirect('/workspace');
  }

  return (
    <WorkflowStudioClient
      organizationName={membership.organization.name}
      role={membership.role}
    />
  );
}
