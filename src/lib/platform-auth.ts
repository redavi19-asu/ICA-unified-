import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { prisma } from './prisma';

const COOKIE_NAME = 'ica_unified_platform_session';
const PLATFORM_ROLES = ['SUPER_ADMIN', 'PLATFORM_ADMIN', 'SUPPORT'] as const;

export type PlatformRole = (typeof PLATFORM_ROLES)[number];

function getSecret() {
  const value = process.env.PLATFORM_AUTH_SECRET || process.env.AUTH_SECRET;
  if (!value && process.env.NODE_ENV === 'production') {
    throw new Error('PLATFORM_AUTH_SECRET or AUTH_SECRET is required in production.');
  }
  return new TextEncoder().encode(value || 'ica-unified-platform-development-secret');
}

function isPlatformRole(value: unknown): value is PlatformRole {
  return typeof value === 'string' && (PLATFORM_ROLES as readonly string[]).includes(value);
}

export type PlatformSession = {
  platformAdminId: string;
  role: PlatformRole;
};

type PlatformSessionInput = Omit<PlatformSession, 'role'> & { role: string };

export async function createPlatformSession(payload: PlatformSessionInput) {
  if (!isPlatformRole(payload.role)) {
    throw new Error('Invalid platform role for session.');
  }

  const safePayload: PlatformSession = { ...payload, role: payload.role };

  return new SignJWT(safePayload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('8h')
    .sign(getSecret());
}

export async function readPlatformSession(): Promise<PlatformSession | null> {
  const token = cookies().get(COOKIE_NAME)?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, getSecret());
    if (typeof payload.platformAdminId !== 'string' || !isPlatformRole(payload.role)) {
      return null;
    }

    return { platformAdminId: payload.platformAdminId, role: payload.role };
  } catch {
    return null;
  }
}

export async function requirePlatformAdmin(allowed: PlatformRole[] = ['SUPER_ADMIN', 'PLATFORM_ADMIN', 'SUPPORT']) {
  const session = await readPlatformSession();
  if (!session || !allowed.includes(session.role)) redirect('/platform/login');

  const admin = await prisma.platformAdmin.findFirst({
    where: { id: session.platformAdminId, role: session.role, active: true },
  });
  if (!admin) redirect('/platform/login');
  return admin;
}

export const platformSessionCookie = {
  name: COOKIE_NAME,
  options: {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 8,
  },
};
