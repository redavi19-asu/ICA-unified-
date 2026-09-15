import { NextResponse } from 'next/server';
import { createMemberQrToken, readMobileSession } from '../../../../lib/mobile-auth';

export async function GET(request: Request) {
  const auth = await readMobileSession(request);
  if (!auth) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });

  const token = await createMemberQrToken({
    userId: auth.membership.userId,
    organizationId: auth.membership.organizationId,
    membershipId: auth.membership.id,
  });

  return NextResponse.json({
    ok: true,
    token,
    qrValue: `icaunified://member/${token}`,
    member: {
      id: auth.membership.userId,
      name: auth.membership.user.name,
      email: auth.membership.user.email,
      role: auth.membership.role,
      status: auth.membership.status,
    },
    organization: {
      id: auth.membership.organizationId,
      name: auth.membership.organization.name,
    },
  });
}
