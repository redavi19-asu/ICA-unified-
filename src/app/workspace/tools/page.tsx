import { redirect } from 'next/navigation';
import { requireSession } from '../../../lib/auth';
import ToolsClient from './ToolsClient';

export default async function ToolsPage() {
  const { membership } = await requireSession();

  if (membership.role !== 'OWNER' && membership.role !== 'ADMIN') {
    redirect('/workspace');
  }

  return (
    <ToolsClient
      organizationName={membership.organization.name}
      role={membership.role}
    />
  );
}
