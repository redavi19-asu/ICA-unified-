import { redirect } from 'next/navigation';
import { readSession } from '../../lib/auth';
import { headers } from 'next/headers';
import { resolveVerifiedCustomDomain } from '../../lib/organization-ops';
import LoginClient from './LoginClient';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ company?: string; portal?: string }>;
}) {
  const session = await readSession();
  if (session) redirect('/workspace');

  const params = await searchParams;
  const host = (await headers()).get('host') || '';
  const customOrganization = await resolveVerifiedCustomDomain(host);
  const defaultOrganizationSlug = customOrganization?.slug || String(params.company || '').trim().toLowerCase();

  return (
    <LoginClient
      defaultOrganizationSlug={defaultOrganizationSlug}
      portalOrganizationName={customOrganization?.name || null}
    />
  );
}
