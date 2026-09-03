import { notFound } from 'next/navigation';
import { requireSession } from '../../../../lib/auth';
import { prisma } from '../../../../lib/prisma';
import CourseClient from './CourseClient';

const lessonKinds = ['TEXT', 'VIDEO', 'DOCUMENT', 'QUIZ'] as const;
type LessonKind = (typeof lessonKinds)[number];

function normalizeLessonKind(value: string): LessonKind {
  return lessonKinds.includes(value as LessonKind) ? (value as LessonKind) : 'TEXT';
}

export default async function CoursePage({ params }: { params: { courseId: string } }) {
  const { membership } = await requireSession();
  const organizationId = membership.organizationId;

  const course = await prisma.course.findFirst({
    where: { id: params.courseId, organizationId },
    include: {
      lessons: {
        orderBy: { order: 'asc' },
        include: { questions: { orderBy: { order: 'asc' } }, progress: { where: { userId: membership.userId } } },
      },
      enrollments: {
        where: { userId: membership.userId },
        include: { credential: { select: { id: true } } },
      },
    },
  });

  if (!course) notFound();

  const canManage = ['OWNER', 'ADMIN', 'MANAGER'].includes(membership.role);
  const members = canManage
    ? await prisma.membership.findMany({
        where: { organizationId, status: { not: 'SUSPENDED' } },
        orderBy: { user: { name: 'asc' } },
        include: { user: { select: { id: true, name: true, email: true } } },
      })
    : [];

  const enrollment = course.enrollments[0] ?? null;

  return (
    <CourseClient
      organizationName={membership.organization.name}
      currentRole={membership.role}
      course={{
        id: course.id,
        title: course.title,
        description: course.description,
        durationMin: course.durationMin,
        required: course.required,
        passingScore: course.passingScore,
        certificateValidDays: course.certificateValidDays,
        lessons: course.lessons.map((lesson) => ({
          id: lesson.id,
          order: lesson.order,
          title: lesson.title,
          kind: normalizeLessonKind(lesson.kind),
          content: lesson.content,
          mediaUrl: lesson.mediaUrl,
          completed: lesson.progress.length > 0,
          questions: lesson.questions.map((q) => ({
            id: q.id,
            prompt: q.prompt,
            options: JSON.parse(q.optionsJson) as string[],
          })),
        })),
      }}
      enrollment={enrollment ? {
        id: enrollment.id,
        status: enrollment.status,
        progress: enrollment.progress,
        score: enrollment.score,
        dueAt: enrollment.dueAt?.toISOString() ?? null,
        credentialId: enrollment.credential?.id ?? null,
      } : null}
      members={members.map((m) => ({ id: m.user.id, name: m.user.name, email: m.user.email, role: m.role }))}
    />
  );
}
