import { randomUUID } from 'crypto';
import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { prisma } from './prisma';
import {
  emailVerificationIsEnforced,
  isUserEmailVerified,
  sessionIsValid,
} from './security';

const COOKIE_NAME = 'ica_unified_session';
const devSecret = 'ica-unified-development-only-secret-change-me';
const APP_ROLES = ['OWNER', 'ADMIN', 'MANAGER', 'MEMBER'] as const;
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24;

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
  sessionId: string;
  issuedAtMs: number;
  expiresAtSeconds: number;
};

type SessionInput = Pick<SessionPayload, 'userId' | 'organizationId' | 'organizationSlug'> & { role: string };

export async function createSession(payload: SessionInput) {
  if (!isAppRole(payload.role)) {
    throw new Error('Invalid organization role for session.');
  }

  const sessionId = randomUUID();
  const issuedAtMs = Date.now();

  return new SignJWT({
    userId: payload.userId,
    organizationId: payload.organizationId,
    organizationSlug: payload.organizationSlug,
    role: payload.role,
    sessionId,
    issuedAtMs,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setJti(sessionId)
    .setIssuedAt()
    .setExpirationTime('24h')
    .sign(getSecret());
}

export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, getSecret());
    if (
      typeof payload.userId !== 'string' ||
      typeof payload.organizationId !== 'string' ||
      typeof payload.organizationSlug !== 'string' ||
      !isAppRole(payload.role) ||
      typeof payload.jti !== 'string' ||
      typeof payload.issuedAtMs !== 'number' ||
      typeof payload.exp !== 'number'
    ) {
      return null;
    }

    const valid = await sessionIsValid({
      sessionId: payload.jti,
      scope: 'user',
      principalId: payload.userId,
      issuedAtMs: payload.issuedAtMs,
    });
    if (!valid) return null;

    return {
      userId: payload.userId,
      organizationId: payload.organizationId,
      organizationSlug: payload.organizationSlug,
      role: payload.role,
      sessionId: payload.jti,
      issuedAtMs: payload.issuedAtMs,
      expiresAtSeconds: payload.exp,
    };
  } catch {
    return null;
  }
}

export async function readSession(): Promise<SessionPayload | null> {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifySessionToken(token);
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

  if (
    membership.status === 'SUSPENDED' ||
    membership.organization.status === 'SUSPENDED' ||
    membership.organization.status === 'CANCELLED'
  ) {
    redirect('/login?unavailable=1');
  }

  if (emailVerificationIsEnforced() && !(await isUserEmailVerified(membership.userId))) {
    redirect('/verify-email/pending');
  }

  return { session, membership };
}

export const sessionCookie = {
  name: COOKIE_NAME,
  options: {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
  },
};
