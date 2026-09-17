import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSession } from '../../../../lib/auth';
import { listEmailOutbox, queueEmail, retryEmailOutbox } from '../../../../lib/organization-ops';
import { emailDeliveryConfigured } from '../../../../lib/email-delivery';

const previewSchema = z.object({
  recipient: z.string().email(),
});

export async function GET() {
  const { membership } = await requireSession();
  if (!['OWNER', 'ADMIN'].includes(membership.role)) {
    return NextResponse.json({ error: 'Owner or admin access is required.' }, { status: 403 });
  }

  const messages = await listEmailOutbox(membership.organizationId);
  const queued = messages.filter((message) => message.status === 'QUEUED').length;
  const sent = messages.filter((message) => message.status === 'SENT').length;
  const failed = messages.filter((message) => message.status === 'FAILED').length;

  return NextResponse.json({
    provider: process.env.EMAIL_PROVIDER || null,
    readyToSend: emailDeliveryConfigured(),
    counts: { queued, sent, failed },
    messages,
    templates: [
      'SYSTEM_TEST',
      'MEMBER_INVITATION',
      'EMAIL_VERIFICATION',
      'PASSWORD_RESET',
      'MEMBERSHIP_APPLICATION',
      'EVENT_REGISTRATION',
      'WORKFLOW_STATUS_UPDATE',
      'WORKFLOW_MEMBERSHIP_ACTIVATION',
      'PAYMENT_RECEIPT',
      'MIGRATION_ACTIVATION',
    ],
  });
}

export async function POST(request: Request) {
  const { membership } = await requireSession();
  if (!['OWNER', 'ADMIN'].includes(membership.role)) {
    return NextResponse.json({ error: 'Owner or admin access is required.' }, { status: 403 });
  }

  const body = await request.json();
  if (body?.action === 'RETRY') {
    if (!emailDeliveryConfigured()) {
      return NextResponse.json({ error: 'Connect the email provider before retrying queued messages.' }, { status: 409 });
    }
    const result = await retryEmailOutbox(membership.organizationId);
    return NextResponse.json({ ok: true, result });
  }

  const parsed = previewSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Enter a valid test recipient.' }, { status: 400 });
  }

  const messageId = await queueEmail({
    organizationId: membership.organizationId,
    recipient: parsed.data.recipient,
    templateKey: 'SYSTEM_TEST',
    subject: `${membership.organization.name} · ICA Unified email test`,
    bodyText: `ICA Unified email delivery is staged for ${membership.organization.name}. Once an email provider is connected, queued messages can be delivered without changing the organization workflows.`,
  });

  return NextResponse.json({
    ok: true,
    messageId,
    status: emailDeliveryConfigured() ? 'DELIVERY_ATTEMPTED' : 'QUEUED',
  }, { status: 201 });
}
