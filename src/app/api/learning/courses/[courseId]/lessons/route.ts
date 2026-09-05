import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSession } from '../../../../../../lib/auth';
import { prisma } from '../../../../../../lib/prisma';

const schema = z.object({
  title: z.string().trim().min(2).max(140),
  kind: z.enum(['TEXT', 'VIDEO', 'DOCUMENT', 'QUIZ']),
  content: z.string().trim().min(1).max(12000),
  mediaUrl: z.string().trim().url().nullable().optional().or(z.literal('')),
  question: z.string().trim().nullable().optional(),
  options: z.array(z.string().trim().min(1)).max(6).default([]),
  correctAnswer: z.string().trim().nullable().optional(),
});

export async function POST(request: Request, props: { params: Promise<{ courseId: string }> }) {
  const params = await props.params;
  const { membership } = await requireSession();
  if (!['OWNER', 'ADMIN', 'MANAGER'].includes(membership.role)) {
    return NextResponse.json({ error: 'You do not have permission to edit courses.' }, { status: 403 });
  }

  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: 'Check the lesson details and try again.' }, { status: 400 });

  const course = await prisma.course.findFirst({ where: { id: params.courseId, organizationId: membership.organizationId } });
  if (!course) return NextResponse.json({ error: 'Course not found.' }, { status: 404 });

  if (parsed.data.kind === 'QUIZ') {
    if (!parsed.data.question || parsed.data.options.length < 2 || !parsed.data.correctAnswer || !parsed.data.options.includes(parsed.data.correctAnswer)) {
      return NextResponse.json({ error: 'Quiz lessons need a question, at least two choices, and a matching correct answer.' }, { status: 400 });
    }
  }

  const last = await prisma.lesson.findFirst({ where: { courseId: course.id }, orderBy: { order: 'desc' } });
  const lesson = await prisma.lesson.create({
    data: {
      organizationId: membership.organizationId,
      courseId: course.id,
      order: (last?.order ?? 0) + 1,
      title: parsed.data.title,
      kind: parsed.data.kind,
      content: parsed.data.content,
      mediaUrl: parsed.data.mediaUrl || null,
      questions: parsed.data.kind === 'QUIZ' ? {
        create: [{
          order: 1,
          prompt: parsed.data.question!,
          optionsJson: JSON.stringify(parsed.data.options),
          correctAnswer: parsed.data.correctAnswer!,
        }],
      } : undefined,
    },
  });

  return NextResponse.json({ lesson });
}
