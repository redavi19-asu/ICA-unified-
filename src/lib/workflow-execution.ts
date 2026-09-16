import { createHash, randomBytes, randomUUID } from 'crypto';
import { prisma } from './prisma';
import { queueEmail, renderInvitationEmail } from './organization-ops';

export type PublicWorkflow = {
  id: string;
  organizationId: string;
  organizationName: string;
  kind: 'MEMBERSHIP' | 'EVENT';
  name: string;
  status: 'DRAFT' | 'ACTIVE';
  config: Record<string, unknown>;
};

export type WorkflowSubmission = {
  id: string;
  workflowId: string;
  organizationId: string;
  kind: string;
  name: string;
  email: string;
  phone: string | null;
  company: string | null;
  notes: string | null;
  status: string;
  paymentStatus: string;
  amountCents: number;
  createdAt: string;
  updatedAt: string;
};

let executionTablesReady: Promise<void> | null = null;

export async function ensureWorkflowExecutionTables() {
  if (!executionTablesReady) {
    executionTablesReady = (async () => {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS WorkflowSubmission (
          id TEXT PRIMARY KEY NOT NULL,
          organizationId TEXT NOT NULL,
          workflowId TEXT NOT NULL,
          kind TEXT NOT NULL,
          name TEXT NOT NULL,
          email TEXT NOT NULL,
          phone TEXT,
          company TEXT,
          notes TEXT,
          answersJson TEXT NOT NULL DEFAULT '{}',
          status TEXT NOT NULL,
          paymentStatus TEXT NOT NULL DEFAULT 'NOT_REQUIRED',
          amountCents INTEGER NOT NULL DEFAULT 0,
          createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          UNIQUE (workflowId, email)
        )
      `);
      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS WorkflowSubmission_org_workflow
        ON WorkflowSubmission (organizationId, workflowId, createdAt)
      `);
      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS WorkflowSubmission_status
        ON WorkflowSubmission (organizationId, status, createdAt)
      `);
    })().catch((error) => {
      executionTablesReady = null;
      throw error;
    });
  }
  return executionTablesReady;
}

export async function getPublicWorkflow(workflowId: string): Promise<PublicWorkflow | null> {
  const rows = await prisma.$queryRawUnsafe<Array<{
    id: string;
    organizationId: string;
    kind: string;
    name: string;
    status: string;
    configJson: string;
  }>>(
    `SELECT id, organizationId, kind, name, status, configJson
     FROM WorkflowDefinition
     WHERE id = ? AND status = 'ACTIVE'
     LIMIT 1`,
    workflowId,
  );

  const row = rows[0];
  if (!row || (row.kind !== 'MEMBERSHIP' && row.kind !== 'EVENT')) return null;

  const organization = await prisma.organization.findUnique({
    where: { id: row.organizationId },
    select: { name: true, status: true, plan: true, trialEndsAt: true },
  });
  if (!organization || ['SUSPENDED', 'CANCELLED'].includes(organization.status)) return null;
  const localTrialExpired =
    organization.plan !== 'internal' &&
    organization.status === 'TRIAL' &&
    Boolean(organization.trialEndsAt && organization.trialEndsAt.getTime() <= Date.now());
  if (localTrialExpired) return null;

  let config: Record<string, unknown> = {};
  try { config = JSON.parse(row.configJson || '{}'); } catch {}

  return {
    id: row.id,
    organizationId: row.organizationId,
    organizationName: organization.name,
    kind: row.kind,
    name: row.name,
    status: 'ACTIVE',
    config,
  };
}

export async function listWorkflowSubmissions(organizationId: string, workflowId: string) {
  await ensureWorkflowExecutionTables();
  return prisma.$queryRawUnsafe<WorkflowSubmission[]>(
    `SELECT id, workflowId, organizationId, kind, name, email, phone, company, notes,
            status, paymentStatus, amountCents, createdAt, updatedAt
     FROM WorkflowSubmission
     WHERE organizationId = ? AND workflowId = ?
     ORDER BY datetime(createdAt) DESC
     LIMIT 500`,
    organizationId,
    workflowId,
  );
}

export async function getWorkflowSubmission(organizationId: string, workflowId: string, submissionId: string) {
  await ensureWorkflowExecutionTables();
  const rows = await prisma.$queryRawUnsafe<WorkflowSubmission[]>(
    `SELECT id, workflowId, organizationId, kind, name, email, phone, company, notes,
            status, paymentStatus, amountCents, createdAt, updatedAt
     FROM WorkflowSubmission
     WHERE id = ? AND organizationId = ? AND workflowId = ?
     LIMIT 1`,
    submissionId,
    organizationId,
    workflowId,
  );
  return rows[0] || null;
}

export async function setWorkflowSubmissionStatus(
  organizationId: string,
  workflowId: string,
  submissionId: string,
  status: string,
) {
  await ensureWorkflowExecutionTables();
  await prisma.$executeRawUnsafe(
    `UPDATE WorkflowSubmission
     SET status = ?, updatedAt = CURRENT_TIMESTAMP
     WHERE id = ? AND organizationId = ? AND workflowId = ?`,
    status,
    submissionId,
    organizationId,
    workflowId,
  );
}

export async function createWorkflowSubmission(input: {
  workflow: PublicWorkflow;
  name: string;
  email: string;
  phone?: string | null;
  company?: string | null;
  notes?: string | null;
  answers?: Record<string, unknown>;
}) {
  await ensureWorkflowExecutionTables();

  const existing = await prisma.$queryRawUnsafe<Array<{ id: string; status: string }>>(
    `SELECT id, status
     FROM WorkflowSubmission
     WHERE workflowId = ? AND email = ?
     LIMIT 1`,
    input.workflow.id,
    input.email.toLowerCase(),
  );
  if (existing[0]) {
    return { duplicate: true as const, submissionId: existing[0].id, status: existing[0].status };
  }

  const price = Number(input.workflow.config.price || 0);
  const amountCents = Number.isFinite(price) && price > 0 ? Math.round(price * 100) : 0;

  let status = 'RECEIVED';
  if (input.workflow.kind === 'MEMBERSHIP') {
    const approvalRequired = Boolean(input.workflow.config.approvalRequired);
    status = approvalRequired ? 'PENDING_REVIEW' : amountCents > 0 ? 'PAYMENT_PENDING' : 'APPROVED';
  } else {
    const capacity = Number(input.workflow.config.capacity || 0);
    let occupied = 0;
    if (Number.isFinite(capacity) && capacity > 0) {
      const countRows = await prisma.$queryRawUnsafe<Array<{ count: number }>>(
        `SELECT COUNT(*) as count
         FROM WorkflowSubmission
         WHERE workflowId = ? AND status NOT IN ('REJECTED','CANCELLED','WAITLISTED')`,
        input.workflow.id,
      );
      occupied = Number(countRows[0]?.count || 0);
    }

    if (Number.isFinite(capacity) && capacity > 0 && occupied >= capacity) {
      status = 'WAITLISTED';
    } else {
      status = amountCents > 0 ? 'PAYMENT_PENDING' : 'REGISTERED';
    }
  }

  const id = randomUUID();
  await prisma.$executeRawUnsafe(
    `INSERT INTO WorkflowSubmission
      (id, organizationId, workflowId, kind, name, email, phone, company, notes,
       answersJson, status, paymentStatus, amountCents, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    id,
    input.workflow.organizationId,
    input.workflow.id,
    input.workflow.kind,
    input.name,
    input.email.toLowerCase(),
    input.phone || null,
    input.company || null,
    input.notes || null,
    JSON.stringify(input.answers || {}),
    status,
    amountCents > 0 ? 'PENDING' : 'NOT_REQUIRED',
    amountCents,
  );

  return { duplicate: false as const, submissionId: id, status, amountCents };
}


export async function createMembershipActivation(input: {
  organizationId: string;
  organizationName: string;
  name: string;
  email: string;
  origin: string;
  invitedById?: string | null;
}) {
  const email = input.email.toLowerCase();
  const existingUser = await prisma.user.findUnique({
    where: { email },
    include: {
      memberships: {
        where: { organizationId: input.organizationId },
        select: { id: true },
      },
    },
  });

  if (existingUser?.memberships[0]) {
    return { alreadyMember: true as const, inviteUrl: null, emailQueued: false };
  }

  await prisma.invitation.updateMany({
    where: {
      organizationId: input.organizationId,
      email,
      status: 'PENDING',
    },
    data: { status: 'REVOKED' },
  });

  const token = randomBytes(32).toString('hex');
  const tokenHash = createHash('sha256').update(token).digest('hex');
  const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

  const invitation = await prisma.invitation.create({
    data: {
      organizationId: input.organizationId,
      email,
      name: input.name,
      role: 'MEMBER',
      status: 'PENDING',
      tokenHash,
      expiresAt,
      invitedById: input.invitedById || null,
    },
  });

  const inviteUrl = `${input.origin}/invite/${token}`;
  const emailContent = renderInvitationEmail({
    organizationName: input.organizationName,
    recipientName: input.name,
    inviteUrl,
    expiresLabel: 'expires in 14 days',
  });

  let emailQueued = true;
  try {
    await queueEmail({
      organizationId: input.organizationId,
      recipient: email,
      templateKey: 'WORKFLOW_MEMBERSHIP_ACTIVATION',
      subject: emailContent.subject,
      bodyText: emailContent.bodyText,
      payload: { invitationId: invitation.id },
    });
  } catch (error) {
    emailQueued = false;
    console.error('ICA_WORKFLOW_ACTIVATION_EMAIL_ERROR', error);
  }

  return { alreadyMember: false as const, inviteUrl, emailQueued };
}
