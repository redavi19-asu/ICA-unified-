import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { prisma } from './prisma';

const COOKIE_NAME = 'ica_unified_session';
const devSecret = 'ica-unified-development-only-secret-change-me';
const APP_ROLES = ['OWNER', 'ADMIN', 'MANAGER', 'MEMBER'] as const;

export type AppRole = (typeof APP_ROLES)[number];

function getSecret() {
  const configuredSecret = process.env.AUTH_SECRET;
  if (!configuredSecret && process.env.NODE_ENV === 'production') {
    throw new Error('AUTH_SECRET must be configured in production.');
  }
  return new TextEncoder().encode(configuredSecret || devSecret);
}

function isAppRole(value: unknown): value is AppRole {
  return typeof value === 'string' && (APP_ROLES as readonly string[]).includes(value);
}

export type SessionPayload = {
  userId: string;
  organizationId: string;
  organizationSlug: string;
  role: AppRole;
};

type SessionInput = Omit<SessionPayload, 'role'> & { role: string };

export async function createSession(payload: SessionInput) {
  if (!isAppRole(payload.role)) {
    throw new Error('Invalid organization role for session.');
  }

  const safePayload: SessionPayload = { ...payload, role: payload.role };

  return new SignJWT(safePayload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('8h')
    .sign(getSecret());
}

export async function readSession(): Promise<SessionPayload | null> {
  const token = cookies().get(COOKIE_NAME)?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, getSecret());
    if (
      typeof payload.userId !== 'string' ||
      typeof payload.organizationId !== 'string' ||
      typeof payload.organizationSlug !== 'string' ||
      !isAppRole(payload.role)
    ) {
      return null;
    }

    return {
      userId: payload.userId,
      organizationId: payload.organizationId,
      organizationSlug: payload.organizationSlug,
      role: payload.role,
    };
  } catch {
    return null;
  }
}

export async function requireSession() {
  const session = await readSession();
  if (!session) redirect('/login');

  const membership = await prisma.membership.findFirst({
    where: {
      userId: session.userId,
      organizationId: session.organizationId,
      role: session.role,
    },
    include: { user: true, organization: true },
  });

  if (!membership) redirect('/login');
  return { session, membership };
}

export const sessionCookie = {
  name: COOKIE_NAME,
  options: {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 8,
  },
};
