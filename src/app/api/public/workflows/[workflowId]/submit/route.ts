import { NextResponse } from 'next/server';
import { z } from 'zod';
import { consumeRateLimit } from '../../../../../../lib/security';
import { verifyTurnstile } from '../../../../../../lib/turnstile';
import {
  createMembershipActivation,
  createWorkflowSubmission,
  getPublicWorkflow,
} from '../../../../../../lib/workflow-execution';
import { emitOrganizationEvent, queueEmail } from '../../../../../../lib/organization-ops';

const schema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().toLowerCase(),
  phone: z.string().trim().max(40).optional().or(z.literal('')),
  company: z.string().trim().max(140).optional().or(z.literal('')),
  notes: z.string().trim().max(3000).optional().or(z.literal('')),
  turnstileToken: z.string().optional(),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ workflowId: string }> },
) {
  try {
    const { workflowId } = await context.params;
    const workflow = await getPublicWorkflow(workflowId);
    if (!workflow) {
      return NextResponse.json({ error: 'This workflow is not available.' }, { status: 404 });
    }

    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: 'Check your name, email, and form details.' }, { status: 400 });
    }

    const limit = await consumeRateLimit(request, {
      scope: 'public-workflow-submit',
      identity: `${workflowId}|${parsed.data.email}`,
      limit: 6,
      windowSeconds: 60 * 60,
    });
    if (!limit.allowed) {
      return NextResponse.json(
        { error: 'Too many submission attempts. Try again later.' },
        { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } },
      );
    }

    const challenge = await verifyTurnstile(parsed.data.turnstileToken, request);
    if (!challenge.success) {
      return NextResponse.json({ error: 'Security verification failed. Please try again.' }, { status: 403 });
    }

    const result = await createWorkflowSubmission({
      workflow,
      name: parsed.data.name,
      email: parsed.data.email,
      phone: parsed.data.phone || null,
      company: parsed.data.company || null,
      notes: parsed.data.notes || null,
      answers: {
        source: 'PUBLIC_WORKFLOW',
        workflowName: workflow.name,
      },
    });

    if (result.duplicate) {
      return NextResponse.json(
        {
          error: 'A submission for this email already exists.',
          status: result.status,
        },
        { status: 409 },
      );
    }

    const origin = new URL(request.url).origin;
    let activationUrl: string | null = null;

    if (
      workflow.kind === 'MEMBERSHIP' &&
      result.status === 'APPROVED' &&
      result.amountCents === 0
    ) {
      const activation = await createMembershipActivation({
        organizationId: workflow.organizationId,
        organizationName: workflow.organizationName,
        name: parsed.data.name,
        email: parsed.data.email,
        origin,
      });
      activationUrl = activation.inviteUrl;
    }

    const statusLabel =
      result.status === 'PENDING_REVIEW' ? 'pending review' :
      result.status === 'PAYMENT_PENDING' ? 'received — payment connection pending' :
      result.status === 'WAITLISTED' ? 'added to the waitlist' :
      result.status === 'REGISTERED' ? 'registered' :
      result.status === 'APPROVED' ? 'approved' :
      'received';

    const configuredSubject = String(
      workflow.config.confirmationSubject ||
      (workflow.kind === 'EVENT' ? 'Registration received' : 'Application received'),
    ).trim();

    const configuredMessage = String(
      workflow.config.confirmationMessage ||
      'Thank you. Your information was received successfully.',
    ).trim();

    const meetingLink =
      workflow.kind === 'EVENT' &&
      result.status === 'REGISTERED' &&
      typeof workflow.config.meetingLink === 'string'
        ? workflow.config.meetingLink.trim()
        : '';

    const emailBody = [
      `Hello ${parsed.data.name},`,
      '',
      configuredMessage,
      '',
      `Status: ${statusLabel.toUpperCase()}`,
      result.amountCents > 0
        ? `Amount configured: $${(result.amountCents / 100).toFixed(2)} — payment has not been collected yet.`
        : '',
      meetingLink ? `Event access: ${meetingLink}` : '',
      activationUrl ? `Activate your ICA Unified account: ${activationUrl}` : '',
      '',
      `${workflow.organizationName} · ICA Unified`,
    ].filter(Boolean).join('\n');

    try {
      await queueEmail({
        organizationId: workflow.organizationId,
        recipient: parsed.data.email,
        templateKey: workflow.kind === 'EVENT' ? 'EVENT_REGISTRATION' : 'MEMBERSHIP_APPLICATION',
        subject: configuredSubject,
        bodyText: emailBody,
        payload: {
          workflowId: workflow.id,
          submissionId: result.submissionId,
          status: result.status,
        },
      });
    } catch (error) {
      console.error('ICA_WORKFLOW_CONFIRMATION_EMAIL_ERROR', error);
    }

    try {
      await emitOrganizationEvent(
        workflow.organizationId,
        workflow.kind === 'EVENT' ? 'event.registration.received' : 'membership.application.received',
        {
          workflowId: workflow.id,
          submissionId: result.submissionId,
          name: parsed.data.name,
          email: parsed.data.email,
          status: result.status,
          amountCents: result.amountCents,
        },
      );
    } catch (error) {
      console.error('ICA_WORKFLOW_SUBMISSION_WEBHOOK_ERROR', error);
    }

    return NextResponse.json({
      ok: true,
      submissionId: result.submissionId,
      status: result.status,
      amountCents: result.amountCents,
      activationUrl,
      message:
        result.status === 'PENDING_REVIEW'
          ? 'Application received and queued for review.'
          : result.status === 'WAITLISTED'
            ? 'Registration received. You are currently on the waitlist.'
            : result.status === 'PAYMENT_PENDING'
              ? 'Registration received. Payment is still pending because the organization payment connection is not enabled yet.'
              : workflow.kind === 'MEMBERSHIP'
                ? 'Membership approved. Your ICA activation information is ready.'
                : 'Registration confirmed.',
    }, { status: 201 });
  } catch (error) {
    console.error('ICA_PUBLIC_WORKFLOW_SUBMIT_ERROR', error);
    return NextResponse.json({ error: 'Unable to submit this workflow right now.' }, { status: 500 });
  }
}
