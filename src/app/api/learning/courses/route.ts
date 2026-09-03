import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSession } from '../../../../lib/auth';
import { prisma } from '../../../../lib/prisma';

const schema = z.object({
  title: z.string().trim().min(3).max(120),
  description: z.string().trim().max(2000).optional().nullable(),
  durationMin: z.number().int().min(0).max(10000).default(0),
  passingScore: z.number().int().min(1).max(100).default(80),
  certificateValidDays: z.number().int().min(1).max(3650).nullable().optional(),
  required: z.boolean().default(false),
});

export async function POST(request: Request) {
  const { membership } = await requireSession();
  if (!['OWNER', 'ADMIN', 'MANAGER'].includes(membership.role)) {
    return NextResponse.json({ error: 'You do not have permission to build courses.' }, { status: 403 });
  }

  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: 'Check the course details and try again.' }, { status: 400 });

  const existing = await prisma.course.findFirst({
    where: { organizationId: membership.organizationId, title: parsed.data.title },
  });
  if (existing) return NextResponse.json({ error: 'A course with that title already exists.' }, { status: 409 });

  const course = await prisma.course.create({
    data: {
      organizationId: membership.organizationId,
      ...parsed.data,
      description: parsed.data.description || null,
      published: true,
    },
  });

  await prisma.activity.create({
    data: {
      organizationId: membership.organizationId,
      actorId: membership.userId,
      type: 'course.created',
      message: `${membership.user.name} created ${course.title}.`,
    },
  });

  return NextResponse.json({ course });
}
