import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSession } from '../../../../lib/auth';
import { prisma } from '../../../../lib/prisma';

const schema = z.object({
  courseId: z.string().min(1),
  userIds: z.array(z.string().min(1)).min(1),
  dueAt: z.string().nullable().optional(),
});

export async function POST(request: Request) {
  const { membership } = await requireSession();
  if (!['OWNER', 'ADMIN', 'MANAGER'].includes(membership.role)) {
    return NextResponse.json({ error: 'You do not have permission to assign courses.' }, { status: 403 });
  }

  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: 'Choose at least one person.' }, { status: 400 });

  const course = await prisma.course.findFirst({ where: { id: parsed.data.courseId, organizationId: membership.organizationId } });
  if (!course) return NextResponse.json({ error: 'Course not found.' }, { status: 404 });

  const validMembers = await prisma.membership.findMany({
    where: { organizationId: membership.organizationId, userId: { in: parsed.data.userIds }, status: { not: 'SUSPENDED' } },
    select: { userId: true },
  });
  if (!validMembers.length) return NextResponse.json({ error: 'No valid company members were selected.' }, { status: 400 });

  const dueAt = parsed.data.dueAt ? new Date(`${parsed.data.dueAt}T23:59:59`) : null;
  await prisma.$transaction(validMembers.map(({ userId }) => prisma.enrollment.upsert({
    where: { userId_courseId: { userId, courseId: course.id } },
    update: { dueAt },
    create: { organizationId: membership.organizationId, userId, courseId: course.id, dueAt },
  })));

  await prisma.activity.create({
    data: {
      organizationId: membership.organizationId,
      actorId: membership.userId,
      type: 'course.assigned',
      message: `${course.title} assigned to ${validMembers.length} team member${validMembers.length === 1 ? '' : 's'}.`,
    },
  });

  return NextResponse.json({ message: `${course.title} assigned to ${validMembers.length} team member${validMembers.length === 1 ? '' : 's'}.` });
}
