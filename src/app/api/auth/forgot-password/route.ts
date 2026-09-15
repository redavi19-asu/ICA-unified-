import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '../../../../lib/prisma';
import { queueEmail } from '../../../../lib/organization-ops';
import { emailDeliveryConfigured } from '../../../../lib/email-delivery';
import { consumeRateLimit, createSecurityToken } from '../../../../lib/security';

const schema = z.object({ email: z.string().trim().email().toLowerCase() });

export async function POST(request: Request) {
  if (!emailDeliveryConfigured()) {
    return NextResponse.json(
      { error: 'Password recovery email is not configured yet. Contact your organization administrator.' },
      { status: 503 },
    );
  }

  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ ok: true, message: 'If that account exists, a reset link will be sent.' });
  }

  const limit = await consumeRateLimit(request, {
    scope: 'forgot-password',
    identity: parsed.data.email,
    limit: 5,
    windowSeconds: 60 * 60,
  });
  if (!limit.allowed) {
    return NextResponse.json(
      { ok: true, message: 'If that account exists, a reset link will be sent.' },
      { headers: { 'Retry-After': String(limit.retryAfterSeconds) } },
    );
  }

  const user = await prisma.user.findUnique({
    where: { email: parsed.data.email },
    include: { memberships: { include: { organization: true }, take: 1 } },
  });

  const membership = user?.memberships[0];
  if (user && membership) {
    const token = await createSecurityToken(user.id, 'PASSWORD_RESET', 60 * 60);
    const resetUrl = `${new URL(request.url).origin}/reset-password?token=${encodeURIComponent(token)}`;
    try {
      await queueEmail({
        organizationId: membership.organizationId,
        recipient: user.email,
        templateKey: 'PASSWORD_RESET',
        subject: 'Reset your ICA Unified password',
        bodyText:
          `Hello ${user.name},\n\nReset your ICA Unified password:\n\n${resetUrl}\n\nThis link expires in 1 hour. If you did not request this, ignore this message.\n\nICA Unified · Built by I Computer Anything`,
      });
    } catch (error) {
      console.error('ICA_PASSWORD_RESET_EMAIL_QUEUE_ERROR', error);
    }
  }

  return NextResponse.json({ ok: true, message: 'If that account exists, a reset link will be sent.' });
}