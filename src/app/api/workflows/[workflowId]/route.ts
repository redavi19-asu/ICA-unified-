import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSession } from '../../../../../lib/auth';
import { prisma } from '../../../../../lib/prisma';

const updateSchema = z.object({
  name: z.string().trim().min(2).max(160).optional(),
  status: z.enum(['DRAFT', 'ACTIVE']).optional(),
  config: z.record(z.string(), z.unknown()).optional(),
}).refine((value) => Object.keys(value).length > 0, {
  message: 'At least one workflow field is required.',
});

async function findWorkflow(organizationId: string, workflowId: string) {
  const rows = await prisma.$queryRawUnsafe<Array<{
    id: string;
    kind: 'MEMBERSHIP' | 'EVENT';
    name: string;
    status: 'DRAFT' | 'ACTIVE';
    configJson: string;
  }>>(
    `SELECT id, kind, name, status, configJson
     FROM WorkflowDefinition
     WHERE id = ? AND organizationId = ?
     LIMIT 1`,
    workflowId,
    organizationId,
  );
  return rows[0] || null;
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ workflowId: string }> },
) {
  const { membership } = await requireSession();
  if (!['OWNER', 'ADMIN', 'MANAGER'].includes(membership.role)) {
    return NextResponse.json({ error: 'Organization staff access required.' }, { status: 403 });
  }

  const { workflowId } = await context.params;
  const workflow = await findWorkflow(membership.organizationId, workflowId);
  if (!workflow) return NextResponse.json({ error: 'Workflow not found.' }, { status: 404 });

  const parsed = updateSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: 'Check the workflow changes and try again.' }, { status: 400 });
  }

  const nextName = parsed.data.name ?? workflow.name;
  const nextStatus = parsed.data.status ?? workflow.status;
  const nextConfig = parsed.data.config ?? (() => {
    try { return JSON.parse(workflow.configJson || '{}') as Record<string, unknown>; }
    catch { return {}; }
  })();

  await prisma.$executeRawUnsafe(
    `UPDATE WorkflowDefinition
     SET name = ?, status = ?, configJson = ?, updatedAt = CURRENT_TIMESTAMP
     WHERE id = ? AND organizationId = ?`,
    nextName,
    nextStatus,
    JSON.stringify(nextConfig),
    workflowId,
    membership.organizationId,
  );

  await prisma.activity.create({
    data: {
      organizationId: membership.organizationId,
      actorId: membership.userId,
      type: 'WORKFLOW_UPDATED',
      message: `${membership.user.name} updated ${workflow.kind === 'MEMBERSHIP' ? 'membership' : 'event'} workflow ${nextName} (${nextStatus}).`,
    },
  });

  return NextResponse.json({
    ok: true,
    workflow: {
      id: workflow.id,
      kind: workflow.kind,
      name: nextName,
      status: nextStatus,
      config: nextConfig,
    },
  });
}
