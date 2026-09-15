import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSession } from '../../../../lib/auth';
import { prisma } from '../../../../lib/prisma';
import {
  addComplianceRequirement,
  createEventCheckinToken,
  setCourseCreditRule,
} from '../../../../lib/compliance';

const schema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('SET_COURSE_CREDITS'),
    courseId: z.string().min(1),
    category: z.string().min(1).max(60),
    credits: z.coerce.number().min(0).max(1000),
  }),
  z.object({
    action: z.literal('ADD_REQUIREMENT'),
    name: z.string().min(2).max(160),
    category: z.string().min(1).max(60),
    requiredCredits: z.coerce.number().positive().max(10000),
    renewalDate: z.string().optional().nullable(),
  }),
  z.object({
    action: z.literal('CREATE_CHECKIN'),
    workflowId: z.string().min(1),
  }),
]);

export async function POST(request: Request) {
  const { membership } = await requireSession();
  if (!['OWNER', 'ADMIN', 'MANAGER'].includes(membership.role)) {
    return NextResponse.json({ error: 'Administrator access required.' }, { status: 403 });
  }

  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: 'Check the compliance settings and try again.' }, { status: 400 });
  }

  const organizationId = membership.organizationId;
  const body = parsed.data;

  if (body.action === 'SET_COURSE_CREDITS') {
    const course = await prisma.course.findFirst({
      where: { id: body.courseId, organizationId },
      select: { id: true, title: true },
    });
    if (!course) return NextResponse.json({ error: 'Course not found.' }, { status: 404 });

    await setCourseCreditRule(organizationId, course.id, body.category, body.credits);
    return NextResponse.json({ ok: true, message: `${course.title} credit rule saved.` });
  }

  if (body.action === 'ADD_REQUIREMENT') {
    const id = await addComplianceRequirement(organizationId, {
      name: body.name,
      category: body.category,
      requiredCredits: body.requiredCredits,
      renewalDate: body.renewalDate || null,
    });
    return NextResponse.json({ ok: true, id, message: 'Compliance requirement added.' });
  }

  const checkin = await createEventCheckinToken(organizationId, body.workflowId);
  if (!checkin) return NextResponse.json({ error: 'Event workflow not found.' }, { status: 404 });

  return NextResponse.json({ ok: true, ...checkin });
}
