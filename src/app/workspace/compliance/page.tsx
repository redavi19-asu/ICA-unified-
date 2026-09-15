import { redirect } from 'next/navigation';
import { requireSession } from '../../../lib/auth';
import { prisma } from '../../../lib/prisma';
import {
  listComplianceRequirements,
  listCourseCreditRules,
} from '../../../lib/compliance';
import ComplianceCenterClient from './ComplianceCenterClient';

export default async function CompliancePage() {
  const { membership } = await requireSession();
  if (!['OWNER', 'ADMIN', 'MANAGER'].includes(membership.role)) {
    redirect('/my/wallet');
  }

  const organizationId = membership.organizationId;
  const [courses, rules, requirements, events] = await Promise.all([
    prisma.course.findMany({
      where: { organizationId },
      orderBy: { title: 'asc' },
      select: { id: true, title: true, published: true },
    }),
    listCourseCreditRules(organizationId),
    listComplianceRequirements(organizationId),
    (async () => {
      try {
        const rows = await prisma.$queryRawUnsafe<Array<{
          id: string;
          name: string;
          status: string;
          configJson: string;
        }>>(
          `SELECT id, name, status, configJson
           FROM WorkflowDefinition
           WHERE organizationId = ? AND kind = 'EVENT'
           ORDER BY datetime(updatedAt) DESC`,
          organizationId,
        );
        return rows.map((row) => {
          let config: Record<string, unknown> = {};
          try { config = JSON.parse(row.configJson || '{}'); } catch {}
          return { id: row.id, name: row.name, status: row.status, config };
        });
      } catch {
        return [];
      }
    })(),
  ]);

  const ruleMap = new Map(rules.map((rule) => [rule.courseId, rule]));

  return (
    <ComplianceCenterClient
      organizationName={membership.organization.name}
      courses={courses.map((course) => ({
        ...course,
        category: ruleMap.get(course.id)?.category || 'GENERAL',
        credits: Number(ruleMap.get(course.id)?.credits || 0),
      }))}
      requirements={requirements.map((row) => ({
        id: row.id,
        name: row.name,
        category: row.category,
        requiredCredits: Number(row.requiredCredits),
        renewalDate: row.renewalDate,
      }))}
      events={events.map((row) => ({
        id: row.id,
        name: row.name,
        status: row.status,
        startAt: typeof row.config.startAt === 'string' ? row.config.startAt : '',
        credits: Number(row.config.ceuCredits || 0),
        category: String(row.config.creditCategory || 'GENERAL'),
      }))}
    />
  );
}
