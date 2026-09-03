import PeopleClient from './PeopleClient';
import { requireSession } from '../../../lib/auth';
import { prisma } from '../../../lib/prisma';

export default async function PeoplePage() {
  const { membership } = await requireSession();
  const organizationId = membership.organizationId;

  const [memberships, invitations] = await Promise.all([
    prisma.membership.findMany({
      where: { organizationId },
      include: { user: true },
      orderBy: [{ role: 'asc' }, { joinedAt: 'asc' }],
    }),
    prisma.invitation.findMany({
      where: { organizationId, status: 'PENDING' },
      orderBy: { createdAt: 'desc' },
      take: 20,
    }),
  ]);

  return (
    <PeopleClient
      organizationName={membership.organization.name}
      currentRole={membership.role}
      people={memberships.map((item) => ({
        id: item.id,
        name: item.user.name,
        email: item.user.email,
        jobTitle: item.jobTitle,
        role: item.role,
        status: item.status,
        joinedAt: item.joinedAt.toISOString(),
      }))}
      invitations={invitations.map((item) => ({
        id: item.id,
        name: item.name,
        email: item.email,
        role: item.role,
        jobTitle: item.jobTitle,
        expiresAt: item.expiresAt.toISOString(),
      }))}
    />
  );
}
