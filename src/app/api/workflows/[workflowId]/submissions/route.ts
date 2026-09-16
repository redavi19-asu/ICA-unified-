import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSession } from '../../../../../../lib/auth';
import { prisma } from '../../../../../../lib/prisma';
import {
  createMembershipActivation,
  getWorkflowSubmission,
  listWorkflowSubmissions,
  setWorkflowSubmissionStatus,
} from '../../../../../../lib/workflow-execution';
import { emitOrganizationEvent, queueEmail } from '../../../../../../lib/organization-ops';

const updateSchema = z.object({
  submissionId: z.string().min(1),
  status: z.enum(['APPROVED', 'REJECTED', 'REGISTERED', 'WAITLISTED', 'CANCELLED']),
});

async function getOwnedWorkflow(organizationId: string, workflowId: string) {
  const rows = await prisma.$queryRawUnsafe<Array<{
    id: string;
    kind: string;
    name: string;
    status: string;
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

export async function GET(
  _request: Request,
  context: { params: Promise<{ workflowId: string }> },
) {
  const { membership } = await requireSession();
  if (!['OWNER', 'ADMIN', 'MANAGER'].includes(membership.role)) {
    return NextResponse.json({ error: 'Organization staff access required.' }, { status: 403 });
  }

  const { workflowId } = await context.params;
  const workflow = await getOwnedWorkflow(membership.organizationId, workflowId);
  if (!workflow) return NextResponse.json({ error: 'Workflow not found.' }, { status: 404 });

  const submissions = await listWorkflowSubmissions(membership.organizationId, workflowId);
  return NextResponse.json({
    workflow: {
      id: workflow.id,
      kind: workflow.kind,
      name: workflow.name,
      status: workflow.status,
    },
    submissions,
  });
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
  const workflow = await getOwnedWorkflow(membership.organizationId, workflowId);
  if (!workflow) return NextResponse.json({ error: 'Workflow not found.' }, { status: 404 });

  const parsed = updateSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: 'Choose a valid submission action.' }, { status: 400 });
  }

  const submission = await getWorkflowSubmission(
    membership.organizationId,
    workflowId,
    parsed.data.submissionId,
  );
  if (!submission) return NextResponse.json({ error: 'Submission not found.' }, { status: 404 });

  if (
    submission.amountCents > 0 &&
    submission.paymentStatus !== 'PAID' &&
    (parsed.data.status === 'APPROVED' || parsed.data.status === 'REGISTERED')
  ) {
    return NextResponse.json({
      error: 'Payment is still pending. Complete the connected-account payment before granting paid access.',
    }, { status: 409 });
  }

  if (workflow.kind === 'MEMBERSHIP' && !['APPROVED', 'REJECTED', 'CANCELLED'].includes(parsed.data.status)) {
    return NextResponse.json({ error: 'Membership applications can be approved, rejected, or cancelled.' }, { status: 400 });
  }
  if (workflow.kind === 'EVENT' && !['REGISTERED', 'WAITLISTED', 'REJECTED', 'CANCELLED'].includes(parsed.data.status)) {
    return NextResponse.json({ error: 'Event submissions can be registered, waitlisted, rejected, or cancelled.' }, { status: 400 });
  }

  await setWorkflowSubmissionStatus(
    membership.organizationId,
    workflowId,
    submission.id,
    parsed.data.status,
  );

  let activationUrl: string | null = null;
  if (workflow.kind === 'MEMBERSHIP' && parsed.data.status === 'APPROVED') {
    const activation = await createMembershipActivation({
      organizationId: membership.organizationId,
      organizationName: membership.organization.name,
      name: submission.name,
      email: submission.email,
      origin: new URL(request.url).origin,
      invitedById: membership.userId,
    });
    activationUrl = activation.inviteUrl;
  }

  const statusText = parsed.data.status.replaceAll('_', ' ');
  try {
    await queueEmail({
      organizationId: membership.organizationId,
      recipient: submission.email,
      templateKey: 'WORKFLOW_STATUS_UPDATE',
      subject: `${workflow.name} · ${statusText}`,
      bodyText: [
        `Hello ${submission.name},`,
        '',
        `Your ${workflow.kind === 'EVENT' ? 'registration' : 'membership application'} for ${workflow.name} is now ${statusText.toLowerCase()}.`,
        activationUrl ? `Activate your ICA Unified account: ${activationUrl}` : '',
        '',
        `${membership.organization.name} · ICA Unified`,
      ].filter(Boolean).join('\n'),
      payload: {
        workflowId,
        submissionId: submission.id,
        status: parsed.data.status,
      },
    });
  } catch (error) {
    console.error('ICA_WORKFLOW_STATUS_EMAIL_ERROR', error);
  }

  try {
    await emitOrganizationEvent(
      membership.organizationId,
      'workflow.submission.updated',
      {
        workflowId,
        submissionId: submission.id,
        kind: workflow.kind,
        email: submission.email,
        status: parsed.data.status,
      },
    );
  } catch (error) {
    console.error('ICA_WORKFLOW_STATUS_WEBHOOK_ERROR', error);
  }

  await prisma.activity.create({
    data: {
      organizationId: membership.organizationId,
      actorId: membership.userId,
      type: 'WORKFLOW_SUBMISSION_UPDATED',
      message: `${membership.user.name} changed ${submission.name}'s ${workflow.name} submission to ${statusText}.`,
    },
  });

  return NextResponse.json({
    ok: true,
    status: parsed.data.status,
    activationUrl,
    message: `${submission.name} updated to ${statusText}.`,
  });
}
