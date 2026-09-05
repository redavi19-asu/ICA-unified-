import { NextResponse } from 'next/server';
import { z } from 'zod';
import { readSession } from '../../../../lib/auth';
import { prisma } from '../../../../lib/prisma';

const appearanceSchema = z.enum(['COMMAND', 'EXECUTIVE']);
const patchSchema = z.object({
  scope: z.enum(['organization', 'user']),
  appearance: appearanceSchema.nullable(),
});

type Appearance = z.infer<typeof appearanceSchema>;

async function ensureAppearanceTable() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS WorkspaceAppearancePreference (
      key TEXT PRIMARY KEY NOT NULL,
      organizationId TEXT NOT NULL,
      userId TEXT,
      appearance TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    )
  `);
}

async function readAppearance(key: string): Promise<Appearance | null> {
  const rows = await prisma.$queryRawUnsafe<Array<{ appearance: string }>>(
    'SELECT appearance FROM WorkspaceAppearancePreference WHERE key = ? LIMIT 1',
    key,
  );

  const value = rows[0]?.appearance;
  return value === 'COMMAND' || value === 'EXECUTIVE' ? value : null;
}

async function getState(organizationId: string, userId: string) {
  const orgDefault = (await readAppearance(`org:${organizationId}`)) ?? 'COMMAND';
  const userOverride = await readAppearance(`user:${organizationId}:${userId}`);

  return {
    orgDefault,
    userOverride,
    effective: userOverride ?? orgDefault,
  };
}

export async function GET() {
  const session = await readSession();
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
  }

  const membership = await prisma.membership.findFirst({
    where: {
      userId: session.userId,
      organizationId: session.organizationId,
      status: 'ACTIVE',
    },
    select: { role: true },
  });

  if (!membership) {
    return NextResponse.json({ error: 'Workspace access is unavailable.' }, { status: 403 });
  }

  await ensureAppearanceTable();
  const state = await getState(session.organizationId, session.userId);

  return NextResponse.json({
    ...state,
    canManageOrganization: membership.role === 'OWNER' || membership.role === 'ADMIN',
  });
}

export async function PATCH(request: Request) {
  const session = await readSession();
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
  }

  const membership = await prisma.membership.findFirst({
    where: {
      userId: session.userId,
      organizationId: session.organizationId,
      status: 'ACTIVE',
    },
    select: { role: true },
  });

  if (!membership) {
    return NextResponse.json({ error: 'Workspace access is unavailable.' }, { status: 403 });
  }

  const parsed = patchSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid appearance setting.' }, { status: 400 });
  }

  const { scope, appearance } = parsed.data;
  const canManageOrganization = membership.role === 'OWNER' || membership.role === 'ADMIN';

  if (scope === 'organization' && !canManageOrganization) {
    return NextResponse.json({ error: 'Only an owner or admin can change the company default.' }, { status: 403 });
  }

  await ensureAppearanceTable();

  if (scope === 'organization') {
    if (!appearance) {
      return NextResponse.json({ error: 'Choose a company default appearance.' }, { status: 400 });
    }

    const key = `org:${session.organizationId}`;
    await prisma.$executeRawUnsafe(
      'INSERT OR REPLACE INTO WorkspaceAppearancePreference (key, organizationId, userId, appearance, updatedAt) VALUES (?, ?, ?, ?, ?)',
      key,
      session.organizationId,
      null,
      appearance,
      new Date().toISOString(),
    );
  } else {
    const key = `user:${session.organizationId}:${session.userId}`;

    if (!appearance) {
      await prisma.$executeRawUnsafe(
        'DELETE FROM WorkspaceAppearancePreference WHERE key = ?',
        key,
      );
    } else {
      await prisma.$executeRawUnsafe(
        'INSERT OR REPLACE INTO WorkspaceAppearancePreference (key, organizationId, userId, appearance, updatedAt) VALUES (?, ?, ?, ?, ?)',
        key,
        session.organizationId,
        session.userId,
        appearance,
        new Date().toISOString(),
      );
    }
  }

  const state = await getState(session.organizationId, session.userId);

  return NextResponse.json({
    ok: true,
    ...state,
    canManageOrganization,
  });
}
