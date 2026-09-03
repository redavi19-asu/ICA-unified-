import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSession } from '../../../../lib/auth';
import { prisma } from '../../../../lib/prisma';

const updateSchema = z.object({
  role: z.enum(['ADMIN', 'MANAGER', 'MEMBER']).optional(),
  status: z.enum(['ONBOARDING', 'ACTIVE', 'SUSPENDED']).optional(),
  jobTitle: z.string().trim().max(100).nullable().optional(),
});

export async function PATCH(request: Request, { params }: { params: { membershipId: string } }) {
  const { membership: actor } = await requireSession();
  if (!['OWNER', 'ADMIN'].includes(actor.role)) {
    return NextResponse.json({ error: 'You do not have permission to manage people.' }, { status: 403 });
  }

  const parsed = updateSchema.safeParse(await request.json());
  if (!parsed.success || Object.keys(parsed.data).length === 0) {
    return NextResponse.json({ error: 'No valid changes were provided.' }, { status: 400 });
  }

  const target = await prisma.membership.findFirst({
    where: { id: params.membershipId, organizationId: actor.organizationId },
    include: { user: true },
  });
  if (!target) return NextResponse.json({ error: 'Person not found.' }, { status: 404 });
  if (target.role === 'OWNER') return NextResponse.json({ error: 'The owner role cannot be changed here.' }, { status: 403 });
  if (target.userId === actor.userId && parsed.data.status === 'SUSPENDED') {
    return NextResponse.json({ error: 'You cannot suspend your own account.' }, { status: 400 });
  }

  const updated = await prisma.membership.update({
    where: { id: target.id },
    data: {
      ...(parsed.data.role ? { role: parsed.data.role } : {}),
      ...(parsed.data.status ? { status: parsed.data.status } : {}),
      ...(parsed.data.jobTitle !== undefined ? { jobTitle: parsed.data.jobTitle || null } : {}),
    },
    include: { user: true },
  });

  await prisma.activity.create({
    data: {
      organizationId: actor.organizationId,
      actorId: actor.userId,
      type: 'PEOPLE_MEMBER_UPDATED',
      message: `${updated.user.name}'s team profile was updated.`,
    },
  });

  return NextResponse.json({
    member: {
      id: updated.id,
      name: updated.user.name,
      email: updated.user.email,
      role: updated.role,
      status: updated.status,
      jobTitle: updated.jobTitle,
    },
  });
}
