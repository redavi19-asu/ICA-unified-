import WorkspaceClient from './WorkspaceClient';
import { requireSession } from '../../lib/auth';
import { prisma } from '../../lib/prisma';

export default async function WorkspacePage() {
  const { membership } = await requireSession();
  const organizationId = membership.organizationId;

  const [members, courses, credentials, documents] = await Promise.all([
    prisma.membership.count({ where: { organizationId } }),
    prisma.course.count({ where: { organizationId } }),
    prisma.credential.count({ where: { organizationId } }),
    prisma.document.count({ where: { organizationId } }),
  ]);

  return (
    <WorkspaceClient
      userName={membership.user.name}
      role={membership.role}
      organizationName={membership.organization.name}
      stats={{ members, courses, credentials, documents }}
    />
  );
}
