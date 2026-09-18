import { requireSession } from '../../lib/auth';
import { prisma } from '../../lib/prisma';
import WorkspaceShellClient from './WorkspaceShellClient';

export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const { membership } = await requireSession();

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
