import { NextResponse } from 'next/server';
import { requireSession } from '../../../../../lib/auth';
import { prisma } from '../../../../../lib/prisma';

export async function POST(_request: Request, props: { params: Promise<{ documentId: string }> }) {
  const params = await props.params;
  const { membership } = await requireSession();

  const document = await prisma.document.findFirst({
    where: {
      id: params.documentId,
      organizationId: membership.organizationId,
    },
    select: { id: true, requiresAck: true },
  });

  if (!document) {
    return NextResponse.json({ error: 'Document not found.' }, { status: 404 });
  }

  if (!document.requiresAck) {
    return NextResponse.json({ error: 'This document does not require acknowledgment.' }, { status: 400 });
  }

  const acknowledgedAt = new Date();
  await prisma.acknowledgment.upsert({
    where: { documentId_userId: { documentId: document.id, userId: membership.userId } },
    update: { acknowledgedAt },
    create: {
      organizationId: membership.organizationId,
      documentId: document.id,
      userId: membership.userId,
      acknowledgedAt,
    },
  });

  await prisma.activity.create({
    data: {
      organizationId: membership.organizationId,
      actorId: membership.userId,
      type: 'document_acknowledged',
      message: `${membership.user.name} acknowledged a controlled document.`,
    },
  });

  return NextResponse.json({ ok: true, acknowledgedAt: acknowledgedAt.toISOString() });
}
