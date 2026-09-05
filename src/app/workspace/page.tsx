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

  const [members, courses, credentials, documents, platformAdmin, workflowStats] = await Promise.all([
    prisma.membership.count({ where: { organizationId } }),
    prisma.course.count({ where: { organizationId } }),
    prisma.credential.count({ where: { organizationId } }),
    prisma.document.count({ where: { organizationId } }),
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

  return (
    <WorkspaceClient
      userName={membership.user.name}
      role={membership.role}
      organizationName={membership.organization.name}
      platformRole={platformAdmin?.active ? platformAdmin.role : null}
      stats={{ members, courses, credentials, documents }}
      workflowStats={workflowStats}
    />
  );
}
