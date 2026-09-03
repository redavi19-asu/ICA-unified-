import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSession } from '../../../lib/auth';
import { prisma } from '../../../lib/prisma';

const documentSchema = z.object({
  title: z.string().min(2).max(120),
  version: z.string().min(1).max(20).default('1.0'),
  requiresAck: z.boolean().default(false),
});

export async function POST(request: Request) {
  const { membership } = await requireSession();
  if (!['OWNER', 'ADMIN', 'MANAGER'].includes(membership.role)) {
    return NextResponse.json({ error: 'You do not have permission to create documents.' }, { status: 403 });
  }

  try {
    const body = documentSchema.parse(await request.json());
    const document = await prisma.document.create({
      data: {
        organizationId: membership.organizationId,
        title: body.title,
        version: body.version,
        requiresAck: body.requiresAck,
      },
    });

    await prisma.activity.create({
      data: {
        organizationId: membership.organizationId,
        actorId: membership.userId,
        type: 'DOCUMENT_CREATED',
        message: `${membership.user.name} created ${document.title} v${document.version}.`,
      },
    });

    return NextResponse.json({ ok: true, document });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Enter a valid document title and version.' }, { status: 400 });
    }
    return NextResponse.json({ error: 'Unable to create document.' }, { status: 500 });
  }
}
