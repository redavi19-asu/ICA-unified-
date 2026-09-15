import { NextResponse } from 'next/server';
import { readMobileSession } from '../../../../../lib/mobile-auth';
import { prisma } from '../../../../../lib/prisma';
import { getEventForToken, recordEventAttendance } from '../../../../../lib/compliance';

export async function POST(
  request: Request,
  context: { params: Promise<{ token: string }> },
) {
  const auth = await readMobileSession(request);
  if (!auth) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });

  const { membership } = auth;
  const { token } = await context.params;
  const event = await getEventForToken(token);

  if (!event) {
    return NextResponse.json({ error: 'This event check-in is invalid or expired.' }, { status: 404 });
  }
  if (event.organizationId !== membership.organizationId) {
    return NextResponse.json({ error: 'This check-in belongs to a different organization.' }, { status: 403 });
  }

  const checkinMode = String(event.config.checkinMode || 'SELF_SCAN');
  if (checkinMode === 'STAFF_SCAN') {
    return NextResponse.json({ error: 'This event uses staff-scanned member check-in.' }, { status: 403 });
  }

  const credits = Number(event.config.ceuCredits || 0);
  const category = String(event.config.creditCategory || 'GENERAL');
  const checkedInAt = await recordEventAttendance({
    organizationId: membership.organizationId,
    workflowId: event.workflowId,
    userId: membership.userId,
    eventName: event.eventName,
    category,
    credits: Number.isFinite(credits) ? credits : 0,
  });

  const certificateRule = String(event.config.certificateRule || 'NONE');
  let credentialCode: string | null = null;

  if (certificateRule === 'ATTENDANCE' || certificateRule === 'COMPLETE_EVENT') {
    const credentialName = `${event.eventName} Attendance Certificate`;
    const existing = await prisma.credential.findFirst({
      where: {
        organizationId: membership.organizationId,
        userId: membership.userId,
        name: credentialName,
      },
      select: { code: true },
    });

    if (existing) {
      credentialCode = existing.code;
    } else {
      credentialCode = `ICA-${crypto.randomUUID().split('-')[0].toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;
      await prisma.credential.create({
        data: {
          organizationId: membership.organizationId,
          userId: membership.userId,
          code: credentialCode,
          name: credentialName,
          issuedAt: new Date(),
          status: 'active',
        },
      });
    }
  }

  await prisma.activity.create({
    data: {
      organizationId: membership.organizationId,
      actorId: membership.userId,
      type: 'event.checked_in.mobile',
      message: `${membership.user.name} checked in to ${event.eventName}${credits > 0 ? ` and earned ${credits} ${category} credit(s)` : ''} from ICA Unified Mobile.`,
    },
  });

  return NextResponse.json({
    ok: true,
    eventName: event.eventName,
    checkedInAt,
    credits: Number.isFinite(credits) ? credits : 0,
    category,
    credentialCode,
    message: credits > 0
      ? `Checked in. ${credits} ${category} credit(s) were added to your ICA Unified record.`
      : 'Checked in successfully.',
  });
}
