import { NextResponse } from 'next/server';
import { requireSession } from '../../../../lib/auth';
import { prisma } from '../../../../lib/prisma';

export async function GET(request: Request) {
  const { membership } = await requireSession();
  if (!['OWNER', 'ADMIN'].includes(membership.role)) {
    return NextResponse.json({ error: 'Owner or admin access is required.' }, { status: 403 });
  }

  const organizationId = membership.organizationId;
  const format = new URL(request.url).searchParams.get('format') || 'json';

  const members = await prisma.membership.findMany({
    where: { organizationId },
    include: { user: { select: { name: true, email: true, createdAt: true } } },
    orderBy: { joinedAt: 'asc' },
  });

  if (format === 'members-csv') {
    const rows = [
      ['Name', 'Email', 'Job Title', 'Role', 'Status', 'Joined At'],
      ...members.map((item) => [
        item.user.name,
        item.user.email,
        item.jobTitle || '',
        item.role,
        item.status,
        item.joinedAt.toISOString(),
      ]),
    ];
    const csv = rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${membership.organization.slug}-members.csv"`,
        'Cache-Control': 'no-store',
      },
    });
  }

  const [courses, enrollments, credentials, documents, activities] = await Promise.all([
    prisma.course.findMany({
      where: { organizationId },
      include: { lessons: { include: { questions: true } } },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.enrollment.findMany({
      where: { organizationId },
      orderBy: { id: 'asc' },
    }),
    prisma.credential.findMany({
      where: { organizationId },
      orderBy: { issuedAt: 'asc' },
    }),
    prisma.document.findMany({
      where: { organizationId },
      include: { acknowledgments: true },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.activity.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'asc' },
      take: 10000,
    }),
  ]);

  const rawTables: Record<string, unknown[]> = {};
  for (const table of [
    'WorkflowDefinition',
    'WorkflowSubmission',
    'CourseCreditRule',
    'CreditLedger',
    'ComplianceRequirement',
    'EventAttendance',
    'DocumentContent',
    'OrganizationPaymentAccount',
    'EmailOutbox',
  ]) {
    try {
      rawTables[table] = await prisma.$queryRawUnsafe<unknown[]>(
        `SELECT * FROM ${table} WHERE organizationId = ?`,
        organizationId,
      );
    } catch {
      rawTables[table] = [];
    }
  }

  if (Array.isArray(rawTables.OrganizationPaymentAccount)) {
    rawTables.OrganizationPaymentAccount = rawTables.OrganizationPaymentAccount.map((row) => {
      const item = row as Record<string, unknown>;
      return {
        organizationId: item.organizationId,
        provider: item.provider,
        onboardingStatus: item.onboardingStatus,
        chargesEnabled: item.chargesEnabled,
        payoutsEnabled: item.payoutsEnabled,
        detailsSubmitted: item.detailsSubmitted,
        updatedAt: item.updatedAt,
      };
    });
  }

  if (Array.isArray(rawTables.EmailOutbox)) {
    rawTables.EmailOutbox = rawTables.EmailOutbox.map((row) => {
      const item = row as Record<string, unknown>;
      return {
        id: item.id,
        organizationId: item.organizationId,
        recipient: item.recipient,
        subject: item.subject,
        templateKey: item.templateKey,
        bodyText: item.bodyText,
        payloadJson: item.payloadJson,
        status: item.status,
        createdAt: item.createdAt,
        sentAt: item.sentAt,
      };
    });
  }

  const backup = {
    schema: 'ica-unified-organization-backup',
    version: 2,
    generatedAt: new Date().toISOString(),
    organization: {
      id: membership.organization.id,
      name: membership.organization.name,
      slug: membership.organization.slug,
      status: membership.organization.status,
      plan: membership.organization.plan,
      trialEndsAt: membership.organization.trialEndsAt,
      createdAt: membership.organization.createdAt,
    },
    members: members.map((item) => ({
      id: item.id,
      userId: item.userId,
      name: item.user.name,
      email: item.user.email,
      userCreatedAt: item.user.createdAt,
      jobTitle: item.jobTitle,
      role: item.role,
      status: item.status,
      joinedAt: item.joinedAt,
    })),
    courses,
    enrollments,
    credentials,
    documents,
    activities,
    operationalData: rawTables,
  };

  return NextResponse.json(backup, {
    headers: {
      'Content-Disposition': `attachment; filename="${membership.organization.slug}-ica-backup.json"`,
      'Cache-Control': 'no-store',
    },
  });
}

function csvCell(value: unknown) {
  const safe = String(value ?? '').replaceAll('"', '""');
  return /[",\n\r]/.test(safe) ? `"${safe}"` : safe;
}
