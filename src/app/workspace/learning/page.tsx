import { requireSession } from '../../../lib/auth';
import { prisma } from '../../../lib/prisma';
import LearningClient from './LearningClient';

export default async function LearningPage() {
  const { membership } = await requireSession();
  const organizationId = membership.organizationId;

  const courses = await prisma.course.findMany({
    where: { organizationId },
    orderBy: { createdAt: 'desc' },
    include: {
      lessons: { select: { id: true } },
      enrollments: {
        where: { userId: membership.userId },
        select: { id: true, status: true, progress: true, score: true, dueAt: true, credential: { select: { id: true } } },
      },
      _count: { select: { enrollments: true } },
    },
  });

  return (
    <LearningClient
      organizationName={membership.organization.name}
      currentRole={membership.role}
      courses={courses.map((course) => ({
        id: course.id,
        title: course.title,
        description: course.description,
        durationMin: course.durationMin,
        required: course.required,
        passingScore: course.passingScore,
        published: course.published,
        lessonCount: course.lessons.length,
        assignedCount: course._count.enrollments,
        enrollment: course.enrollments[0]
          ? {
              ...course.enrollments[0],
              dueAt: course.enrollments[0].dueAt?.toISOString() ?? null,
            }
          : null,
      }))}
    />
  );
}
