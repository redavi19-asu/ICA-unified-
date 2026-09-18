import { SignJWT, jwtVerify } from 'jose';
import { prisma } from './prisma';
import { organizationHasUnifiedAccess, verifySessionToken } from './auth';

const qrDevSecret = 'ica-unified-development-only-secret-change-me';

function getQrSecret() {
  const configuredSecret = process.env.AUTH_SECRET;
  if (!configuredSecret && process.env.NODE_ENV === 'production') {
    throw new Error('AUTH_SECRET must be configured in production.');
  }
  return new TextEncoder().encode(configuredSecret || qrDevSecret);
}

export async function createMemberQrToken(input: { userId: string; organizationId: string; membershipId: string }) {
  return new SignJWT({
    purpose: 'ICA_MEMBER_QR',
    userId: input.userId,
    organizationId: input.organizationId,
    membershipId: input.membershipId,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('15m')
    .sign(getQrSecret());
}

export async function verifyMemberQrToken(token: string) {
  try {
    const { payload } = await jwtVerify(token, getQrSecret());
    if (
      payload.purpose !== 'ICA_MEMBER_QR' ||
      typeof payload.userId !== 'string' ||
      typeof payload.organizationId !== 'string' ||
      typeof payload.membershipId !== 'string'
    ) return null;

    return {
      userId: payload.userId,
      organizationId: payload.organizationId,
      membershipId: payload.membershipId,
    };
  } catch {
    return null;
  }
}


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

  if (!(await organizationHasUnifiedAccess(membership.organization))) return null;

  return { session, membership };
}