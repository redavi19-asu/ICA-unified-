import { prisma } from './prisma';
import { verifySessionToken } from './auth';

export async function readMobileSession(request: Request) {
  const header = request.headers.get('authorization') || '';
  if (!header.toLowerCase().startsWith('bearer ')) return null;

  const token = header.slice(7).trim();
  const session = await verifySessionToken(token);
  if (!session) return null;

  const membership = await prisma.membership.findFirst({
    where: {
      userId: session.userId,
      organizationId: session.organizationId,
      role: session.role,
    },
    include: { user: true, organization: true },
  });

  if (!membership) return null;
  if (
    membership.status === 'SUSPENDED' ||
    membership.organization.status === 'SUSPENDED' ||
    membership.organization.status === 'CANCELLED'
  ) return null;

  return { session, membership };
}
