import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSession } from '../../../../lib/auth';
import {
  createWebhook,
  deleteWebhook,
  emitOrganizationEvent,
  listWebhooks,
} from '../../../../lib/organization-ops';

const createSchema = z.object({
  url: z.string().url().refine((value) => value.startsWith('https://'), 'Webhook URL must use HTTPS.'),
  eventTypes: z.array(z.string().trim().min(1).max(80)).max(20).default(['*']),
});

export async function GET() {
  const { membership } = await requireSession();
  if (!['OWNER', 'ADMIN'].includes(membership.role)) {
    return NextResponse.json({ error: 'Owner or admin access is required.' }, { status: 403 });
  }

  const hooks = await listWebhooks(membership.organizationId);
  return NextResponse.json({
    webhooks: hooks.map((hook) => ({
      ...hook,
      active: Boolean(hook.active),
      eventTypes: safeEvents(hook.eventTypesJson),
      secret: `${hook.secret.slice(0, 12)}••••••••••••`,
    })),
  });
}

export async function POST(request: Request) {
  const { membership } = await requireSession();
  if (!['OWNER', 'ADMIN'].includes(membership.role)) {
    return NextResponse.json({ error: 'Owner or admin access is required.' }, { status: 403 });
  }

  const body = await request.json();
  if (body?.action === 'TEST') {
    await emitOrganizationEvent(membership.organizationId, 'integration.test', {
      organizationId: membership.organizationId,
      organizationName: membership.organization.name,
      message: 'ICA Unified webhook test delivery',
    });
    return NextResponse.json({ ok: true });
  }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Check the webhook URL and events.' }, { status: 400 });
  }

  const hook = await createWebhook({
    organizationId: membership.organizationId,
    url: parsed.data.url,
    eventTypes: parsed.data.eventTypes,
  });

  return NextResponse.json({
    webhook: {
      id: hook.id,
      secret: hook.secret,
      url: parsed.data.url,
      eventTypes: parsed.data.eventTypes,
    },
    warning: 'Copy the signing secret now. It is only shown in full when the webhook is created.',
  }, { status: 201 });
}

export async function DELETE(request: Request) {
  const { membership } = await requireSession();
  if (!['OWNER', 'ADMIN'].includes(membership.role)) {
    return NextResponse.json({ error: 'Owner or admin access is required.' }, { status: 403 });
  }

  const id = new URL(request.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Webhook id is required.' }, { status: 400 });

  await deleteWebhook(membership.organizationId, id);
  return NextResponse.json({ ok: true });
}

function safeEvents(value: string) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : ['*'];
  } catch {
    return ['*'];
  }
}
