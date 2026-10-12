import { randomUUID } from 'crypto';
import { NextResponse } from 'next/server';
import { requireSession } from '../../../../lib/auth';
import { prisma } from '../../../../lib/prisma';
import { readMobileSession } from '../../../../lib/mobile-auth';
import { ensureAccountDeletionTables } from '../../../../lib/account-deletion';

async function deletionMembership(request: Request) {
  if (request.headers.has('authorization')) {
    const mobile = await readMobileSession(request, { allowUnentitled: true });
    return mobile?.membership || null;
  }
  return (await requireSession({ allowUnentitled: true })).membership;
}


export async function GET(request: Request) {
  const membership = await deletionMembership(request);
  if (!membership) return NextResponse.json({ error: 'Sign in to manage your account.' }, { status: 401 });
  await ensureAccountDeletionTables();
  const requests = await prisma.$queryRawUnsafe<Array<{
    id: string;
    scope: 'ACCOUNT' | 'ORGANIZATION';
    status: string;
    requestedAt: string;
    resolvedAt: string | null;
    message: string | null;
    expectedCompletionAt: string | null;
  }>>(
    `SELECT r.id, r.scope, CASE WHEN r.status = 'PENDING' THEN COALESCE(review.status,r.status) ELSE r.status END AS status, r.requestedAt, r.resolvedAt, review.message, review.expectedCompletionAt
     FROM AccountDeletionRequest r
     LEFT JOIN AccountDeletionReview review ON review.requestId = r.id
     WHERE r.organizationId = ? AND r.userId = ?
     ORDER BY r.requestedAt DESC
     LIMIT 20`,
    membership.organizationId,
    membership.userId,
  );
  return NextResponse.json({ requests });
}

export async function POST(request: Request) {
  const membership = await deletionMembership(request);
  if (!membership) return NextResponse.json({ error: 'Sign in to manage your account.' }, { status: 401 });
  await ensureAccountDeletionTables();
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
     WHERE organizationId = ? AND userId = ? AND scope = ? AND status IN ('PENDING','UNDER_REVIEW','NEEDS_INFORMATION')
     LIMIT 1`,
    membership.organizationId,
    membership.userId,
    scope,
  );
  if (existing[0]) {
    return NextResponse.json({ ok: true, requestId: existing[0].id, message: 'A deletion request is already pending.' });
  }

  const id = randomUUID();
  const inserted = await prisma.$executeRawUnsafe(
    `INSERT INTO AccountDeletionRequest
      (id, organizationId, userId, scope, status, requestedAt)
     SELECT ?, ?, ?, ?, 'PENDING', CURRENT_TIMESTAMP
     WHERE NOT EXISTS (SELECT 1 FROM AccountDeletionRequest WHERE organizationId = ? AND userId = ? AND scope = ?
       AND status IN ('PENDING','UNDER_REVIEW','NEEDS_INFORMATION'))`,
    id,
    membership.organizationId,
    membership.userId,
    scope,
    membership.organizationId,
    membership.userId,
    scope,
  );
  if (!inserted) {
    const pending = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
      "SELECT id FROM AccountDeletionRequest WHERE organizationId = ? AND userId = ? AND scope = ? AND status IN ('PENDING','UNDER_REVIEW','NEEDS_INFORMATION') ORDER BY requestedAt LIMIT 1",
      membership.organizationId, membership.userId, scope,
    );
    return NextResponse.json({ ok: true, requestId: pending[0]?.id, message: 'A deletion request is already in review.' });
  }

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
