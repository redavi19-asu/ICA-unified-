import { createHash, randomBytes } from 'crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSession } from '../../../../lib/auth';
import { prisma } from '../../../../lib/prisma';
import { emitOrganizationEvent, queueEmail, renderInvitationEmail } from '../../../../lib/organization-ops';

const rowSchema = z.object({
  rowNumber: z.number().int().positive(),
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().toLowerCase(),
  jobTitle: z.string().trim().max(120).optional().default(''),
  role: z.enum(['ADMIN', 'MANAGER', 'MEMBER']).default('MEMBER'),
  status: z.enum(['ONBOARDING', 'ACTIVE', 'SUSPENDED']).default('ACTIVE'),
});

const requestSchema = z.object({
  action: z.enum(['PREVIEW', 'COMMIT']),
  duplicateMode: z.enum(['SKIP', 'UPDATE']).default('UPDATE'),
  rows: z.array(z.unknown()).min(1).max(2000),
});

type NormalizedRow = z.infer<typeof rowSchema>;

async function ensureImportTables() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS MigrationMemberState (
      id TEXT PRIMARY KEY NOT NULL,
      organizationId TEXT NOT NULL,
      email TEXT NOT NULL,
      desiredRole TEXT NOT NULL DEFAULT 'MEMBER',
      desiredStatus TEXT NOT NULL DEFAULT 'ACTIVE',
      jobTitle TEXT,
      sourceRow INTEGER,
      createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (organizationId, email)
    )
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS MigrationMemberState_org_email
    ON MigrationMemberState (organizationId, email)
  `);
}

function normalizeRows(rawRows: unknown[]) {
  const valid: NormalizedRow[] = [];
  const invalid: Array<{ rowNumber: number; error: string }> = [];
  const seen = new Set<string>();

  rawRows.forEach((raw, index) => {
    const parsed = rowSchema.safeParse(raw);
    const rowNumber = typeof raw === 'object' && raw && 'rowNumber' in raw && typeof (raw as { rowNumber?: unknown }).rowNumber === 'number'
      ? Number((raw as { rowNumber: number }).rowNumber)
      : index + 2;

    if (!parsed.success) {
      invalid.push({
        rowNumber,
        error: parsed.error.issues.map((issue) => issue.message).join('; '),
      });
      return;
    }

    if (seen.has(parsed.data.email)) {
      invalid.push({ rowNumber: parsed.data.rowNumber, error: 'Duplicate email inside this import file.' });
      return;
    }

    seen.add(parsed.data.email);
    valid.push(parsed.data);
  });

  return { valid, invalid };
}

async function classifyRows(
  organizationId: string,
  rows: NormalizedRow[],
  duplicateMode: 'SKIP' | 'UPDATE',
  currentMembershipId: string,
) {
  const emails = rows.map((row) => row.email);
  const users = emails.length
    ? await prisma.user.findMany({
        where: { email: { in: emails } },
        include: {
          memberships: {
            where: { organizationId },
            select: { id: true, role: true, status: true, jobTitle: true },
          },
        },
      })
    : [];

  const userMap = new Map(users.map((user) => [user.email.toLowerCase(), user]));

  return rows.map((row) => {
    const user = userMap.get(row.email);
    const membership = user?.memberships[0];

    if (membership) {
      const protectedReason =
        membership.role === 'OWNER'
          ? 'OWNER accounts cannot be changed by bulk import.'
          : membership.id === currentMembershipId
            ? 'The administrator running this import cannot change their own access through bulk import.'
            : null;

      return {
        ...row,
        classification: protectedReason
          ? 'SKIP_EXISTING'
          : duplicateMode === 'UPDATE'
            ? 'UPDATE_EXISTING'
            : 'SKIP_EXISTING',
        existingMembershipId: membership.id,
        currentRole: membership.role,
        currentStatus: membership.status,
        protectedReason,
      };
    }

    return {
      ...row,
      classification: user ? 'INVITE_EXISTING_ICA_USER' : 'INVITE_NEW_USER',
      existingMembershipId: null,
      currentRole: null,
      currentStatus: null,
    };
  });
}

export async function POST(request: Request) {
  const { membership } = await requireSession();

  if (!['OWNER', 'ADMIN'].includes(membership.role)) {
    return NextResponse.json({ error: 'Owner or admin access is required for data migration.' }, { status: 403 });
  }

  const parsedRequest = requestSchema.safeParse(await request.json());
  if (!parsedRequest.success) {
    return NextResponse.json({ error: 'Import request is invalid or exceeds the 2,000-row batch limit.' }, { status: 400 });
  }

  const { valid, invalid } = normalizeRows(parsedRequest.data.rows);
  const classified = await classifyRows(
    membership.organizationId,
    valid,
    parsedRequest.data.duplicateMode,
    membership.id,
  );

  const summary = {
    totalReceived: parsedRequest.data.rows.length,
    valid: valid.length,
    invalid: invalid.length,
    newInvites: classified.filter((row) => row.classification === 'INVITE_NEW_USER').length,
    existingUserInvites: classified.filter((row) => row.classification === 'INVITE_EXISTING_ICA_USER').length,
    updates: classified.filter((row) => row.classification === 'UPDATE_EXISTING').length,
    skipped: classified.filter((row) => row.classification === 'SKIP_EXISTING').length,
  };

  if (parsedRequest.data.action === 'PREVIEW') {
    return NextResponse.json({
      ok: true,
      summary,
      invalid,
      rows: classified.slice(0, 200),
      truncatedPreview: classified.length > 200,
    });
  }

  await ensureImportTables();

  const result = {
    updated: 0,
    invited: 0,
    skipped: 0,
    failed: invalid.length,
    activationLinks: [] as Array<{ name: string; email: string; inviteUrl: string }>,
    errors: [...invalid],
  };

  const origin = new URL(request.url).origin;

  for (const row of classified) {
    try {
      if (row.classification === 'SKIP_EXISTING') {
        result.skipped += 1;
        continue;
      }

      if (row.classification === 'UPDATE_EXISTING' && row.existingMembershipId) {
        await prisma.membership.update({
          where: { id: row.existingMembershipId },
          data: {
            role: row.role,
            status: row.status,
            jobTitle: row.jobTitle || null,
          },
        });
        result.updated += 1;
        continue;
      }

      await prisma.invitation.updateMany({
        where: {
          organizationId: membership.organizationId,
          email: row.email,
          status: 'PENDING',
        },
        data: { status: 'REVOKED' },
      });

      const token = randomBytes(32).toString('hex');
      const tokenHash = createHash('sha256').update(token).digest('hex');
      const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 14);

      await prisma.invitation.create({
        data: {
          organizationId: membership.organizationId,
          email: row.email,
          name: row.name,
          jobTitle: row.jobTitle || null,
          role: row.role,
          tokenHash,
          expiresAt,
          invitedById: membership.userId,
        },
      });

      await prisma.$executeRawUnsafe(
        `INSERT INTO MigrationMemberState
         (id, organizationId, email, desiredRole, desiredStatus, jobTitle, sourceRow, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
         ON CONFLICT(organizationId, email) DO UPDATE SET
           desiredRole = excluded.desiredRole,
           desiredStatus = excluded.desiredStatus,
           jobTitle = excluded.jobTitle,
           sourceRow = excluded.sourceRow,
           updatedAt = CURRENT_TIMESTAMP`,
        crypto.randomUUID(),
        membership.organizationId,
        row.email,
        row.role,
        row.status,
        row.jobTitle || null,
        row.rowNumber,
      );

      const inviteUrl = `${origin}/invite/${token}`;
      result.invited += 1;
      result.activationLinks.push({
        name: row.name,
        email: row.email,
        inviteUrl,
      });

      try {
        const emailContent = renderInvitationEmail({
          organizationName: membership.organization.name,
          recipientName: row.name,
          inviteUrl,
          expiresLabel: 'expires in 14 days',
        });
        await queueEmail({
          organizationId: membership.organizationId,
          recipient: row.email,
          templateKey: 'MIGRATION_ACTIVATION',
          subject: emailContent.subject,
          bodyText: emailContent.bodyText,
          payload: { sourceRow: row.rowNumber },
        });
      } catch (emailError) {
        console.error('ICA_IMPORT_EMAIL_QUEUE_ERROR', row.email, emailError);
      }
    } catch (error) {
      console.error('ICA_MEMBER_IMPORT_ROW_ERROR', row.email, error);
      result.failed += 1;
      result.errors.push({ rowNumber: row.rowNumber, error: 'Unable to import this row.' });
    }
  }

  await prisma.activity.create({
    data: {
      organizationId: membership.organizationId,
      actorId: membership.userId,
      type: 'DATA_IMPORT_MEMBERS',
      message: `Member migration processed: ${result.updated} updated, ${result.invited} activation records created, ${result.skipped} skipped, ${result.failed} failed.`,
    },
  });

  try {
    await emitOrganizationEvent(membership.organizationId, 'migration.members.completed', {
      updated: result.updated,
      invited: result.invited,
      skipped: result.skipped,
      failed: result.failed,
    });
  } catch (error) {
    console.error('ICA_IMPORT_WEBHOOK_ERROR', error);
  }

  return NextResponse.json({
    ok: true,
    summary,
    result,
  });
}
