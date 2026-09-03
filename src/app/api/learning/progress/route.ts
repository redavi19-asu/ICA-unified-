import { randomUUID } from 'crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSession } from '../../../../lib/auth';
import { prisma } from '../../../../lib/prisma';

const schema = z.object({
  courseId: z.string().min(1),
  lessonId: z.string().min(1),
  answers: z.record(z.string()).optional(),
});

export async function POST(request: Request) {
  const { membership } = await requireSession();
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: 'Invalid progress request.' }, { status: 400 });

  const lesson = await prisma.lesson.findFirst({
    where: {
      id: parsed.data.lessonId,
      courseId: parsed.data.courseId,
      organizationId: membership.organizationId,
    },
    include: {
      course: true,
      questions: { orderBy: { order: 'asc' } },
    },
  });
  if (!lesson) return NextResponse.json({ error: 'Lesson not found.' }, { status: 404 });

  const enrollment = await prisma.enrollment.upsert({
    where: { userId_courseId: { userId: membership.userId, courseId: lesson.courseId } },
    update: {},
    create: {
      organizationId: membership.organizationId,
      userId: membership.userId,
      courseId: lesson.courseId,
    },
  });

  let quizScore: number | null = null;
  if (lesson.kind === 'QUIZ') {
    const answers = parsed.data.answers || {};
    if (!lesson.questions.length) return NextResponse.json({ error: 'This quiz does not have any questions yet.' }, { status: 400 });

    const correct = lesson.questions.filter((question) => answers[question.id] === question.correctAnswer).length;
    quizScore = Math.round((correct / lesson.questions.length) * 100);
    const passed = quizScore >= lesson.course.passingScore;

    await prisma.quizAttempt.create({
      data: {
        organizationId: membership.organizationId,
        userId: membership.userId,
        courseId: lesson.courseId,
        lessonId: lesson.id,
        score: quizScore,
        passed,
        answersJson: JSON.stringify(answers),
      },
    });

    await prisma.enrollment.update({
      where: { id: enrollment.id },
      data: { attempts: { increment: 1 }, score: quizScore, status: passed ? 'IN_PROGRESS' : enrollment.status },
    });

    if (!passed) {
      return NextResponse.json({ passed: false, score: quizScore, message: `Score ${quizScore}%. You need ${lesson.course.passingScore}% to pass. Review the material and try again.` });
    }
  }

  await prisma.lessonProgress.upsert({
    where: { userId_lessonId: { userId: membership.userId, lessonId: lesson.id } },
    update: { completedAt: new Date() },
    create: {
      organizationId: membership.organizationId,
      userId: membership.userId,
      lessonId: lesson.id,
    },
  });

  const [totalLessons, completedLessons] = await Promise.all([
    prisma.lesson.count({ where: { courseId: lesson.courseId } }),
    prisma.lessonProgress.count({ where: { userId: membership.userId, lesson: { courseId: lesson.courseId } } }),
  ]);

  const progress = totalLessons ? Math.min(100, Math.round((completedLessons / totalLessons) * 100)) : 0;
  const complete = totalLessons > 0 && completedLessons >= totalLessons;
  const completedAt = complete ? new Date() : null;

  await prisma.enrollment.update({
    where: { id: enrollment.id },
    data: {
      progress,
      status: complete ? 'COMPLETE' : 'IN_PROGRESS',
      completedAt,
      ...(quizScore !== null ? { score: quizScore } : {}),
    },
  });

  let credentialId: string | null = null;
  if (complete) {
    const expiresAt = lesson.course.certificateValidDays
      ? new Date(Date.now() + lesson.course.certificateValidDays * 24 * 60 * 60 * 1000)
      : null;

    const credential = await prisma.credential.upsert({
      where: { enrollmentId: enrollment.id },
      update: { issuedAt: new Date(), expiresAt, status: 'active', name: `${lesson.course.title} Certificate` },
      create: {
        organizationId: membership.organizationId,
        userId: membership.userId,
        enrollmentId: enrollment.id,
        code: `ICA-${randomUUID().split('-')[0].toUpperCase()}-${Date.now().toString(36).toUpperCase()}`,
        name: `${lesson.course.title} Certificate`,
        issuedAt: new Date(),
        expiresAt,
        status: 'active',
      },
    });
    credentialId = credential.id;

    await prisma.activity.create({
      data: {
        organizationId: membership.organizationId,
        actorId: membership.userId,
        type: 'course.completed',
        message: `${membership.user.name} completed ${lesson.course.title}.`,
      },
    });
  }

  return NextResponse.json({
    passed: true,
    score: quizScore,
    progress,
    complete,
    credentialId,
    message: complete ? `Course complete. Credential generated automatically.` : `Lesson complete. Course progress is now ${progress}%.`,
  });
}
