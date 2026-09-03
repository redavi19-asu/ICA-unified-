import { requireSession } from '../../lib/auth';
import { prisma } from '../../lib/prisma';
import MyDashboardClient from './MyDashboardClient';

export default async function MyDashboardPage() {
  const { membership } = await requireSession();
  const organizationId = membership.organizationId;
  const userId = membership.userId;

  const [enrollments, credentials, documents] = await Promise.all([
    prisma.enrollment.findMany({
      where: { organizationId, userId },
      orderBy: [{ status: 'asc' }, { dueAt: 'asc' }],
      include: {
        course: { select: { id: true, title: true, description: true, durationMin: true, required: true } },
      },
    }),
    prisma.credential.findMany({
      where: { organizationId, userId },
      orderBy: { issuedAt: 'desc' },
    }),
    prisma.document.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      include: {
        acknowledgments: {
          where: { userId },
          select: { acknowledgedAt: true },
        },
      },
    }),
  ]);

  return (
    <MyDashboardClient
      user={{
        name: membership.user.name,
        email: membership.user.email,
        role: membership.role,
        jobTitle: membership.jobTitle,
      }}
      organizationName={membership.organization.name}
      enrollments={enrollments.map((item) => ({
        id: item.id,
        status: item.status,
        progress: item.progress,
        score: item.score,
        dueAt: item.dueAt?.toISOString() ?? null,
        completedAt: item.completedAt?.toISOString() ?? null,
        course: item.course,
      }))}
      credentials={credentials.map((item) => ({
        id: item.id,
        name: item.name,
        code: item.code,
        status: item.status,
        issuedAt: item.issuedAt?.toISOString() ?? null,
        expiresAt: item.expiresAt?.toISOString() ?? null,
      }))}
      documents={documents.map((item) => ({
        id: item.id,
        title: item.title,
        version: item.version,
        requiresAck: item.requiresAck,
        acknowledgedAt: item.acknowledgments[0]?.acknowledgedAt?.toISOString() ?? null,
      }))}
    />
  );
}
