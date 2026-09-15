import { NextResponse } from 'next/server';
import { readMobileSession } from '../../../../lib/mobile-auth';

export async function GET(request: Request) {
  const auth = await readMobileSession(request);
  if (!auth) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });

  const { membership } = auth;
  return NextResponse.json({
    ok: true,
    user: {
      id: membership.userId,
      name: membership.user.name,
      email: membership.user.email,
      role: membership.role,
      status: membership.status,
      jobTitle: membership.jobTitle,
    },
    organization: {
      id: membership.organizationId,
      name: membership.organization.name,
      slug: membership.organization.slug,
      status: membership.organization.status,
      plan: membership.organization.plan,
    },
  });
}
