import { redirect } from 'next/navigation';
import WorkspaceClient from './WorkspaceClient';
import { requireSession } from '../../lib/auth';
import { prisma } from '../../lib/prisma';

export default async function WorkspacePage() {
  const { membership } = await requireSession();

  if (membership.role === 'MEMBER') {
    redirect('/my');
  }

  const organizationId = membership.organizationId;

  const [memberships, courses, enrollments, credentials, documents, platformAdmin, workflowStats] = await Promise.all([
    prisma.membership.findMany({
      where: { organizationId },
      select: { role: true },
    }),
    prisma.course.count({ where: { organizationId } }),
    prisma.enrollment.findMany({
      where: { organizationId },
      select: { status: true, progress: true, dueAt: true },
    }),
    prisma.credential.findMany({
      where: { organizationId },
      select: { status: true, expiresAt: true },
    }),
    prisma.document.findMany({
      where: { organizationId },
      select: {
        requiresAck: true,
        acknowledgments: { select: { acknowledgedAt: true } },
      },
    }),
    prisma.platformAdmin.findUnique({
      where: { email: membership.user.email.toLowerCase() },
      select: { role: true, active: true },
    }),
    (async () => {
      try {
        const rows = await prisma.$queryRawUnsafe<Array<{
          kind: string;
          status: string;
          configJson: string;
        }>>(
          `SELECT kind, status, configJson
           FROM WorkflowDefinition
           WHERE organizationId = ?`,
          organizationId
        );

        let membershipPrograms = 0;
        let activeEvents = 0;
        let draftWorkflows = 0;
        let upcomingEvents = 0;
        let ceuConfiguredEvents = 0;
        const now = Date.now();

        for (const row of rows) {
          if (row.kind === 'MEMBERSHIP') membershipPrograms += 1;
          if (row.status === 'DRAFT') draftWorkflows += 1;

          if (row.kind === 'EVENT') {
            if (row.status === 'ACTIVE') activeEvents += 1;

            try {
              const config = JSON.parse(row.configJson || '{}') as {
                startAt?: string;
                ceuCredits?: string | number;
              };

              if (config.startAt) {
                const start = new Date(config.startAt).getTime();
                if (Number.isFinite(start) && start > now) upcomingEvents += 1;
              }

              if (config.ceuCredits !== undefined && String(config.ceuCredits).trim() !== '' && Number(config.ceuCredits) > 0) {
                ceuConfiguredEvents += 1;
              }
            } catch {
              // Ignore malformed workflow config in dashboard summary.
            }
          }
        }

        return {
          total: rows.length,
          membershipPrograms,
          activeEvents,
          draftWorkflows,
          upcomingEvents,
          ceuConfiguredEvents,
        };
      } catch {
        return {
          total: 0,
          membershipPrograms: 0,
          activeEvents: 0,
          draftWorkflows: 0,
          upcomingEvents: 0,
          ceuConfiguredEvents: 0,
        };
      }
    })(),
  ]);

  const now = new Date();
  const memberRoleCounts = {
    owners: memberships.filter((item) => item.role === 'OWNER').length,
    admins: memberships.filter((item) => item.role === 'ADMIN').length,
    managers: memberships.filter((item) => item.role === 'MANAGER').length,
    members: memberships.filter((item) => item.role === 'MEMBER').length,
  };

  const averageCompletion = enrollments.length
    ? Math.round(enrollments.reduce((sum, item) => sum + item.progress, 0) / enrollments.length)
    : 0;
  const overdueTraining = enrollments.filter(
    (item) => item.status !== 'COMPLETE' && item.dueAt && item.dueAt < now,
  ).length;

  const credentialActive = credentials.filter(
    (item) => item.status === 'active' && (!item.expiresAt || item.expiresAt > now),
  ).length;
  const credentialExpiringSoon = credentials.filter(
    (item) => item.expiresAt &&
      item.expiresAt > now &&
      item.expiresAt.getTime() - now.getTime() <= 30 * 86400000,
  ).length;
  const credentialExpired = credentials.filter(
    (item) => Boolean(item.expiresAt && item.expiresAt <= now),
  ).length;

  let requiredAcknowledgments = 0;
  let completedAcknowledgments = 0;
  for (const document of documents) {
    if (!document.requiresAck) continue;
    requiredAcknowledgments += memberships.length;
    completedAcknowledgments += document.acknowledgments.filter((ack) => ack.acknowledgedAt).length;
  }
  const pendingAcknowledgments = Math.max(0, requiredAcknowledgments - completedAcknowledgments);
  const documentCompliance = requiredAcknowledgments
    ? Math.round((completedAcknowledgments / requiredAcknowledgments) * 100)
    : 100;

  return (
    <WorkspaceClient
      userName={membership.user.name}
      role={membership.role}
      organizationName={membership.organization.name}
      platformRole={platformAdmin?.active ? platformAdmin.role : null}
      stats={{
        members: memberships.length,
        courses,
        credentials: credentials.length,
        documents: documents.length,
        assignments: enrollments.length,
        averageCompletion,
        overdueTraining,
        credentialActive,
        credentialExpiringSoon,
        credentialExpired,
        documentCompliance,
        pendingAcknowledgments,
        roleCounts: memberRoleCounts,
      }}
      workflowStats={workflowStats}
    />
  );
}
