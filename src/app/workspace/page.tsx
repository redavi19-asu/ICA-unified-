import { redirect } from 'next/navigation';
import WorkspaceClient from './WorkspaceClient';
import { requireSession } from '../../lib/auth';
import { prisma } from '../../lib/prisma';

export default async function WorkspacePage() {
  const { membership } = await requireSession();

  if (membership.role === 'MEMBER') {
    redirect('/my');
  }

  const organizationId = membership.organizationId;

  const [members, courses, credentials, documents, platformAdmin] = await Promise.all([
    prisma.membership.count({ where: { organizationId } }),
    prisma.course.count({ where: { organizationId } }),
    prisma.credential.count({ where: { organizationId } }),
    prisma.document.count({ where: { organizationId } }),
    prisma.platformAdmin.findUnique({
      where: { email: membership.user.email.toLowerCase() },
      select: { role: true, active: true },
    }),
  ]);

  return (
    <WorkspaceClient
      userName={membership.user.name}
      role={membership.role}
      organizationName={membership.organization.name}
      platformRole={platformAdmin?.active ? platformAdmin.role : null}
      stats={{ members, courses, credentials, documents }}
    />
  );
}
