import { prisma } from './prisma';
import { createSession } from './auth';

export class WorkspaceSelectionRequired extends Error {}

// Platform authority never grants membership in a customer organization.
// Only an existing, available membership can produce a workspace session.
export async function createMasterWorkspaceSession(email: string, organizationSlug = '') {
  const memberships = await prisma.membership.findMany({
    where: {
      user: { email: email.trim().toLowerCase() },
      status: { not: 'SUSPENDED' },
      organization: {
        ...(organizationSlug ? { slug: organizationSlug } : {}),
        status: { notIn: ['SUSPENDED', 'CANCELLED'] },
      },
    },
    include: { organization: true },
    take: 2,
  });
  if (memberships.length > 1) {
    throw new WorkspaceSelectionRequired('Enter the ICA Company ID to choose your workspace.');
  }
  const membership = memberships[0];
  if (!membership) return null;
  return createSession({
    userId: membership.userId,
    organizationId: membership.organizationId,
    organizationSlug: membership.organization.slug,
    role: membership.role,
  });
}
