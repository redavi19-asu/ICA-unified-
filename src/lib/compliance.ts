import { prisma } from './prisma';

export type CreditLedgerEntry = {
  id: string;
  sourceType: string;
  sourceId: string;
  category: string;
  credits: number;
  description: string;
  awardedAt: string;
};

export type ComplianceRequirementView = {
  id: string;
  name: string;
  category: string;
  requiredCredits: number;
  earnedCredits: number;
  gap: number;
  renewalDate: string | null;
  source: 'COMPLIANCE' | 'MEMBERSHIP';
  met: boolean;
};

export type ComplianceRecommendation = {
  courseId: string;
  title: string;
  category: string;
  credits: number;
};

export async function ensureComplianceTables() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS CourseCreditRule (
      courseId TEXT PRIMARY KEY NOT NULL,
      organizationId TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'GENERAL',
      credits REAL NOT NULL DEFAULT 0,
      updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS CourseCreditRule_org_category
    ON CourseCreditRule (organizationId, category)
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS CreditLedger (
      id TEXT PRIMARY KEY NOT NULL,
      organizationId TEXT NOT NULL,
      userId TEXT NOT NULL,
      sourceType TEXT NOT NULL,
      sourceId TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'GENERAL',
      credits REAL NOT NULL DEFAULT 0,
      description TEXT NOT NULL,
      awardedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (organizationId, userId, sourceType, sourceId)
    )
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS CreditLedger_org_user
    ON CreditLedger (organizationId, userId, awardedAt)
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS ComplianceRequirement (
      id TEXT PRIMARY KEY NOT NULL,
      organizationId TEXT NOT NULL,
      name TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'GENERAL',
      requiredCredits REAL NOT NULL DEFAULT 0,
      renewalDate TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS ComplianceRequirement_org_active
    ON ComplianceRequirement (organizationId, active)
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS EventCheckinToken (
      token TEXT PRIMARY KEY NOT NULL,
      organizationId TEXT NOT NULL,
      workflowId TEXT NOT NULL,
      expiresAt TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS EventCheckinToken_org_workflow
    ON EventCheckinToken (organizationId, workflowId)
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS EventAttendance (
      id TEXT PRIMARY KEY NOT NULL,
      organizationId TEXT NOT NULL,
      workflowId TEXT NOT NULL,
      userId TEXT NOT NULL,
      checkedInAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (organizationId, workflowId, userId)
    )
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS EventAttendance_org_user
    ON EventAttendance (organizationId, userId, checkedInAt)
  `);
}

export async function setCourseCreditRule(
  organizationId: string,
  courseId: string,
  category: string,
  credits: number,
) {
  await ensureComplianceTables();
  await prisma.$executeRawUnsafe(
    `INSERT INTO CourseCreditRule (courseId, organizationId, category, credits, updatedAt)
     VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(courseId) DO UPDATE SET
       organizationId = excluded.organizationId,
       category = excluded.category,
       credits = excluded.credits,
       updatedAt = CURRENT_TIMESTAMP`,
    courseId,
    organizationId,
    normalizeCategory(category),
    credits,
  );
}

export async function addComplianceRequirement(
  organizationId: string,
  input: { name: string; category: string; requiredCredits: number; renewalDate?: string | null },
) {
  await ensureComplianceTables();
  const id = crypto.randomUUID();
  await prisma.$executeRawUnsafe(
    `INSERT INTO ComplianceRequirement
     (id, organizationId, name, category, requiredCredits, renewalDate, active, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    id,
    organizationId,
    input.name,
    normalizeCategory(input.category),
    input.requiredCredits,
    input.renewalDate || null,
  );
  return id;
}

export async function listCourseCreditRules(organizationId: string) {
  await ensureComplianceTables();
  return prisma.$queryRawUnsafe<Array<{
    courseId: string;
    category: string;
    credits: number;
    updatedAt: string;
  }>>(
    `SELECT courseId, category, credits, updatedAt
     FROM CourseCreditRule
     WHERE organizationId = ?
     ORDER BY category, courseId`,
    organizationId,
  );
}

export async function listComplianceRequirements(organizationId: string) {
  await ensureComplianceTables();
  return prisma.$queryRawUnsafe<Array<{
    id: string;
    name: string;
    category: string;
    requiredCredits: number;
    renewalDate: string | null;
    active: number;
  }>>(
    `SELECT id, name, category, requiredCredits, renewalDate, active
     FROM ComplianceRequirement
     WHERE organizationId = ? AND active = 1
     ORDER BY CASE WHEN renewalDate IS NULL THEN 1 ELSE 0 END, renewalDate, name`,
    organizationId,
  );
}

export async function awardCourseCredits(
  organizationId: string,
  userId: string,
  courseId: string,
  courseTitle: string,
) {
  await ensureComplianceTables();
  const rows = await prisma.$queryRawUnsafe<Array<{ category: string; credits: number }>>(
    `SELECT category, credits
     FROM CourseCreditRule
     WHERE organizationId = ? AND courseId = ?
     LIMIT 1`,
    organizationId,
    courseId,
  );

  const rule = rows[0];
  if (!rule || Number(rule.credits) <= 0) return null;

  await upsertCredit({
    organizationId,
    userId,
    sourceType: 'COURSE',
    sourceId: courseId,
    category: rule.category,
    credits: Number(rule.credits),
    description: courseTitle,
  });

  return { category: rule.category, credits: Number(rule.credits) };
}

async function upsertCredit(input: {
  organizationId: string;
  userId: string;
  sourceType: string;
  sourceId: string;
  category: string;
  credits: number;
  description: string;
}) {
  await prisma.$executeRawUnsafe(
    `INSERT INTO CreditLedger
     (id, organizationId, userId, sourceType, sourceId, category, credits, description, awardedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(organizationId, userId, sourceType, sourceId) DO UPDATE SET
       category = excluded.category,
       credits = excluded.credits,
       description = excluded.description`,
    crypto.randomUUID(),
    input.organizationId,
    input.userId,
    input.sourceType,
    input.sourceId,
    normalizeCategory(input.category),
    input.credits,
    input.description,
  );
}

async function syncCompletedCourseCredits(organizationId: string, userId: string) {
  const completed = await prisma.enrollment.findMany({
    where: { organizationId, userId, status: 'COMPLETE' },
    include: { course: { select: { id: true, title: true } } },
  });

  for (const enrollment of completed) {
    await awardCourseCredits(
      organizationId,
      userId,
      enrollment.course.id,
      enrollment.course.title,
    );
  }
}

async function membershipRequirements(organizationId: string) {
  try {
    const rows = await prisma.$queryRawUnsafe<Array<{
      id: string;
      name: string;
      configJson: string;
    }>>(
      `SELECT id, name, configJson
       FROM WorkflowDefinition
       WHERE organizationId = ? AND kind = 'MEMBERSHIP' AND status = 'ACTIVE'`,
      organizationId,
    );

    return rows.flatMap((row) => {
      try {
        const config = JSON.parse(row.configJson || '{}') as {
          ceCreditsRequired?: string | number;
          ceCategory?: string;
        };
        const requiredCredits = Number(config.ceCreditsRequired || 0);
        if (!Number.isFinite(requiredCredits) || requiredCredits <= 0) return [];
        return [{
          id: `membership:${row.id}`,
          name: `${row.name} renewal`,
          category: normalizeCategory(config.ceCategory || 'GENERAL'),
          requiredCredits,
          renewalDate: null as string | null,
          source: 'MEMBERSHIP' as const,
        }];
      } catch {
        return [];
      }
    });
  } catch {
    return [];
  }
}

export async function getMemberComplianceSummary(organizationId: string, userId: string) {
  await ensureComplianceTables();
  await syncCompletedCourseCredits(organizationId, userId);

  const [ledgerRaw, requirementsRaw, memberRequirements, rules, enrollments] = await Promise.all([
    prisma.$queryRawUnsafe<Array<{
      id: string;
      sourceType: string;
      sourceId: string;
      category: string;
      credits: number;
      description: string;
      awardedAt: string;
    }>>(
      `SELECT id, sourceType, sourceId, category, credits, description, awardedAt
       FROM CreditLedger
       WHERE organizationId = ? AND userId = ?
       ORDER BY datetime(awardedAt) DESC`,
      organizationId,
      userId,
    ),
    listComplianceRequirements(organizationId),
    membershipRequirements(organizationId),
    listCourseCreditRules(organizationId),
    prisma.enrollment.findMany({
      where: { organizationId, userId },
      select: { courseId: true, status: true },
    }),
  ]);

  const ledger: CreditLedgerEntry[] = ledgerRaw.map((row) => ({
    ...row,
    credits: Number(row.credits),
  }));

  const totals = new Map<string, number>();
  for (const entry of ledger) {
    const category = normalizeCategory(entry.category);
    totals.set(category, (totals.get(category) || 0) + Number(entry.credits));
  }

  const combined = [
    ...requirementsRaw.map((row) => ({
      id: row.id,
      name: row.name,
      category: normalizeCategory(row.category),
      requiredCredits: Number(row.requiredCredits),
      renewalDate: row.renewalDate,
      source: 'COMPLIANCE' as const,
    })),
    ...memberRequirements,
  ];

  const requirements: ComplianceRequirementView[] = combined.map((row) => {
    const earnedCredits = totals.get(row.category) || 0;
    const gap = Math.max(0, row.requiredCredits - earnedCredits);
    return {
      ...row,
      earnedCredits,
      gap,
      met: gap <= 0,
    };
  });

  const incomplete = new Set(
    enrollments.filter((row) => row.status !== 'COMPLETE').map((row) => row.courseId),
  );
  const completed = new Set(
    enrollments.filter((row) => row.status === 'COMPLETE').map((row) => row.courseId),
  );
  const gapCategories = new Set(requirements.filter((row) => !row.met).map((row) => row.category));
  const ruleByCourse = new Map(rules.map((row) => [row.courseId, {
    category: normalizeCategory(row.category),
    credits: Number(row.credits),
  }]));

  const eligibleCourseIds = rules
    .filter((row) => gapCategories.has(normalizeCategory(row.category)) && !completed.has(row.courseId))
    .map((row) => row.courseId);

  const courses = eligibleCourseIds.length
    ? await prisma.course.findMany({
        where: {
          organizationId,
          id: { in: eligibleCourseIds },
          published: true,
        },
        select: { id: true, title: true },
      })
    : [];

  const recommendations: ComplianceRecommendation[] = courses
    .map((course) => {
      const rule = ruleByCourse.get(course.id);
      if (!rule) return null;
      return {
        courseId: course.id,
        title: course.title,
        category: rule.category,
        credits: rule.credits,
        assigned: incomplete.has(course.id),
      };
    })
    .filter((row): row is ComplianceRecommendation & { assigned: boolean } => Boolean(row))
    .sort((a, b) => Number(b.assigned) - Number(a.assigned) || b.credits - a.credits)
    .slice(0, 6)
    .map(({ courseId, title, category, credits }) => ({ courseId, title, category, credits }));

  const earnedTotal = ledger.reduce((sum, row) => sum + Number(row.credits), 0);
  const requiredTotal = requirements.reduce((sum, row) => sum + row.requiredCredits, 0);
  const outstandingTotal = requirements.reduce((sum, row) => sum + row.gap, 0);

  return {
    earnedTotal,
    requiredTotal,
    outstandingTotal,
    ready: requirements.length > 0 && requirements.every((row) => row.met),
    requirements,
    ledger,
    recommendations,
    totalsByCategory: Object.fromEntries(totals.entries()),
  };
}

export async function createEventCheckinToken(organizationId: string, workflowId: string) {
  await ensureComplianceTables();

  const rows = await prisma.$queryRawUnsafe<Array<{
    id: string;
    name: string;
    configJson: string;
  }>>(
    `SELECT id, name, configJson
     FROM WorkflowDefinition
     WHERE id = ? AND organizationId = ? AND kind = 'EVENT'
     LIMIT 1`,
    workflowId,
    organizationId,
  );

  const event = rows[0];
  if (!event) return null;

  // Self-scan event QR codes are deliberately short-lived so a screenshot
  // cannot be reused for days. Creating a new code invalidates the prior one.
  const expires = new Date(Date.now() + 30 * 60 * 1000);
  await prisma.$executeRawUnsafe(
    `UPDATE EventCheckinToken
     SET active = 0
     WHERE organizationId = ? AND workflowId = ? AND active = 1`,
    organizationId,
    workflowId,
  );

  const token = crypto.randomUUID().replaceAll('-', '');
  await prisma.$executeRawUnsafe(
    `INSERT INTO EventCheckinToken
     (token, organizationId, workflowId, expiresAt, active, createdAt)
     VALUES (?, ?, ?, ?, 1, CURRENT_TIMESTAMP)`,
    token,
    organizationId,
    workflowId,
    expires.toISOString(),
  );

  return { token, eventName: event.name, expiresAt: expires.toISOString() };
}

export async function getEventForToken(token: string) {
  await ensureComplianceTables();

  const rows = await prisma.$queryRawUnsafe<Array<{
    token: string;
    organizationId: string;
    workflowId: string;
    expiresAt: string;
    active: number;
    name: string;
    configJson: string;
  }>>(
    `SELECT t.token, t.organizationId, t.workflowId, t.expiresAt, t.active,
            w.name, w.configJson
     FROM EventCheckinToken t
     JOIN WorkflowDefinition w ON w.id = t.workflowId
     WHERE t.token = ? AND w.kind = 'EVENT'
     LIMIT 1`,
    token,
  );

  const row = rows[0];
  if (!row || !row.active || new Date(row.expiresAt) < new Date()) return null;

  let config: Record<string, unknown> = {};
  try {
    config = JSON.parse(row.configJson || '{}');
  } catch {
    config = {};
  }

  return {
    token: row.token,
    organizationId: row.organizationId,
    workflowId: row.workflowId,
    eventName: row.name,
    expiresAt: row.expiresAt,
    config,
  };
}

export async function recordEventAttendance(input: {
  organizationId: string;
  workflowId: string;
  userId: string;
  eventName: string;
  category: string;
  credits: number;
}) {
  await ensureComplianceTables();
  const id = crypto.randomUUID();

  await prisma.$executeRawUnsafe(
    `INSERT INTO EventAttendance
     (id, organizationId, workflowId, userId, checkedInAt)
     VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(organizationId, workflowId, userId) DO NOTHING`,
    id,
    input.organizationId,
    input.workflowId,
    input.userId,
  );

  if (input.credits > 0) {
    await upsertCredit({
      organizationId: input.organizationId,
      userId: input.userId,
      sourceType: 'EVENT',
      sourceId: input.workflowId,
      category: input.category,
      credits: input.credits,
      description: input.eventName,
    });
  }

  return prisma.$queryRawUnsafe<Array<{ checkedInAt: string }>>(
    `SELECT checkedInAt
     FROM EventAttendance
     WHERE organizationId = ? AND workflowId = ? AND userId = ?
     LIMIT 1`,
    input.organizationId,
    input.workflowId,
    input.userId,
  ).then((rows) => rows[0]?.checkedInAt || new Date().toISOString());
}

function normalizeCategory(value: string) {
  return value.trim().toUpperCase().replace(/[^A-Z0-9 _-]/g, '').slice(0, 60) || 'GENERAL';
}