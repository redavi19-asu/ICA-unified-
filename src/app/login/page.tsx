import { redirect } from 'next/navigation';
import { readSession } from '../../lib/auth';
import { headers } from 'next/headers';
import { resolveVerifiedCustomDomain } from '../../lib/organization-ops';
import LoginClient from './LoginClient';
import { prisma } from '../../lib/prisma';
import { signedInLoginDestination } from '../../lib/security-policy';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ company?: string; portal?: string; social_error?: string }>;
}) {
  const session = await readSession();
  if (session) {
    const membership = await prisma.membership.findFirst({
      where: { userId: session.userId, organizationId: session.organizationId, role: session.role },
      include: { organization: true },
    });
    if (membership) {
      const destination = signedInLoginDestination(membership.role, membership.status, membership.organization.status);
      if (destination) redirect(destination);
    }
  }

  const params = await searchParams;
  const host = (await headers()).get('host') || '';
  const customOrganization = await resolveVerifiedCustomDomain(host);
  const defaultOrganizationSlug = customOrganization?.slug || String(params.company || '').trim().toLowerCase();

  return (
    <LoginClient
      defaultOrganizationSlug={defaultOrganizationSlug}
      portalOrganizationName={customOrganization?.name || null}
      initialError={String(params.social_error || '')}
    />
  );
}
