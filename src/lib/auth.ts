import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { prisma } from './prisma';

const COOKIE_NAME = 'ica_unified_session';
const devSecret = 'ica-unified-development-only-secret-change-me';

function getSecret() {
  return new TextEncoder().encode(process.env.AUTH_SECRET || devSecret);
}

export type SessionPayload = {
  userId: string;
  organizationId: string;
  organizationSlug: string;
  role: 'OWNER' | 'ADMIN' | 'MANAGER' | 'MEMBER';
};

export async function createSession(payload: SessionPayload) {
  return new SignJWT(payload)
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
    return payload as SessionPayload;
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
