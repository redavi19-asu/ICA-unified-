import { randomUUID } from 'crypto';
import { NextResponse } from 'next/server';
import { requireSession } from '../../../../lib/auth';
import { prisma } from '../../../../lib/prisma';

async function ensureTable() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS AccountDeletionRequest (
      id TEXT PRIMARY KEY NOT NULL,
      organizationId TEXT NOT NULL,
      userId TEXT NOT NULL,
      scope TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING',
      requestedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      resolvedAt TEXT,
      resolutionNote TEXT
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS AccountDeletionRequest_org_status
    ON AccountDeletionRequest (organizationId, status, requestedAt)
  `);
}

export async function GET() {
  const { membership } = await requireSession({ allowUnentitled: true });
  await ensureTable();
  const requests = await prisma.$queryRawUnsafe<Array<{
    id: string;
    scope: 'ACCOUNT' | 'ORGANIZATION';
    status: string;
    requestedAt: string;
  }>>(
    `SELECT id, scope, status, requestedAt
     FROM AccountDeletionRequest
     WHERE organizationId = ? AND userId = ?
     ORDER BY requestedAt DESC
     LIMIT 20`,
    membership.organizationId,
    membership.userId,
  );
  return NextResponse.json({ requests });
}

export async function POST(request: Request) {
  const { membership } = await requireSession({ allowUnentitled: true });
  await ensureTable();
  const body = await request.json().catch(() => ({}));
  const scope = String(body?.scope || '').toUpperCase();
  if (body?.confirmation !== 'DELETE') {
    return NextResponse.json({ error: 'Type DELETE to confirm the request.' }, { status: 400 });
  }
  if (!['ACCOUNT', 'ORGANIZATION'].includes(scope)) {
    return NextResponse.json({ error: 'Invalid deletion request.' }, { status: 400 });
  }
  if (scope === 'ORGANIZATION' && membership.role !== 'OWNER') {
    return NextResponse.json({ error: 'Only the Organization Owner can request workspace deletion.' }, { status: 403 });
  }

  const existing = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
    `SELECT id FROM AccountDeletionRequest
     WHERE organizationId = ? AND userId = ? AND scope = ? AND status = 'PENDING'
     LIMIT 1`,
    membership.organizationId,
    membership.userId,
    scope,
  );
  if (existing[0]) {
    return NextResponse.json({ ok: true, requestId: existing[0].id, message: 'A deletion request is already pending.' });
  }

  const id = randomUUID();
  await prisma.$executeRawUnsafe(
    `INSERT INTO AccountDeletionRequest
      (id, organizationId, userId, scope, status, requestedAt)
     VALUES (?, ?, ?, ?, 'PENDING', CURRENT_TIMESTAMP)`,
    id,
    membership.organizationId,
    membership.userId,
    scope,
  );

  try {
    await prisma.activity.create({
      data: {
        organizationId: membership.organizationId,
        actorId: membership.userId,
        type: scope === 'ORGANIZATION' ? 'organization.deletion_requested' : 'account.deletion_requested',
        message: scope === 'ORGANIZATION'
          ? `${membership.organization.name} workspace deletion requested.`
          : `${membership.user.email} account deletion requested.`,
      },
    });
  } catch {}

  return NextResponse.json({
    ok: true,
    requestId: id,
    message: scope === 'ORGANIZATION'
      ? 'Workspace deletion request submitted for ICA review.'
      : 'Account deletion request submitted for ICA review.',
  }, { status: 201 });
}
