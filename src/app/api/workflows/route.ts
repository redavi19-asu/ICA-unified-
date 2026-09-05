import { NextResponse } from 'next/server';
import { z } from 'zod';
import { readSession } from '../../../lib/auth';
import { prisma } from '../../../lib/prisma';

const workflowSchema = z.object({
  kind: z.enum(['MEMBERSHIP', 'EVENT']),
  name: z.string().min(2).max(160),
  status: z.enum(['DRAFT', 'ACTIVE']),
  config: z.record(z.string(), z.unknown()),
});

async function actor() {
  const session = await readSession();
  if (!session) return null;

  const membership = await prisma.membership.findFirst({
    where: {
      userId: session.userId,
      organizationId: session.organizationId,
      role: session.role,
    },
  });

  if (!membership || !['OWNER', 'ADMIN', 'MANAGER'].includes(membership.role)) return null;
  return { session, membership };
}

async function ensureTable() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS WorkflowDefinition (
      id TEXT PRIMARY KEY NOT NULL,
      organizationId TEXT NOT NULL,
      kind TEXT NOT NULL,
      name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'DRAFT',
      configJson TEXT NOT NULL,
      createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS WorkflowDefinition_org_kind
    ON WorkflowDefinition (organizationId, kind)
  `);
}

export async function GET() {
  const current = await actor();
  if (!current) {
    return NextResponse.json({ error: 'Organization administrator access required.' }, { status: 403 });
  }

  await ensureTable();

  const rows = await prisma.$queryRawUnsafe<Array<{
    id: string;
    kind: string;
    name: string;
    status: string;
    configJson: string;
    createdAt: string;
    updatedAt: string;
  }>>(
    `SELECT id, kind, name, status, configJson, createdAt, updatedAt
     FROM WorkflowDefinition
     WHERE organizationId = ?
     ORDER BY datetime(updatedAt) DESC`,
    current.session.organizationId
  );

  return NextResponse.json({
    ok: true,
    workflows: rows.map((row) => ({
      ...row,
      config: JSON.parse(row.configJson || '{}'),
    })),
  });
}

export async function POST(request: Request) {
  const current = await actor();
  if (!current) {
    return NextResponse.json({ error: 'Organization administrator access required.' }, { status: 403 });
  }

  try {
    const body = workflowSchema.parse(await request.json());
    await ensureTable();

    const id = crypto.randomUUID();
    await prisma.$executeRawUnsafe(
      `INSERT INTO WorkflowDefinition
       (id, organizationId, kind, name, status, configJson, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      id,
      current.session.organizationId,
      body.kind,
      body.name,
      body.status,
      JSON.stringify(body.config)
    );

    await prisma.activity.create({
      data: {
        organizationId: current.session.organizationId,
        actorId: current.session.userId,
        type: 'WORKFLOW_CREATED',
        message: `${body.kind === 'MEMBERSHIP' ? 'Membership' : 'Event'} workflow created: ${body.name} (${body.status})`,
      },
    });

    return NextResponse.json({ ok: true, id }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Check the workflow details and try again.' }, { status: 400 });
    }

    console.error('ICA_WORKFLOW_CREATE_ERROR', error);
    return NextResponse.json({ error: 'Unable to save workflow.' }, { status: 500 });
  }
}
