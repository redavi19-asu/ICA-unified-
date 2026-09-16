import { NextResponse } from 'next/server';
import { z } from 'zod';
import { readMobileSession, verifyMemberQrToken } from '../../../../lib/mobile-auth';
import { prisma } from '../../../../lib/prisma';
import { recordEventAttendance } from '../../../../lib/compliance';

const schema = z.object({
  workflowId: z.string().min(1),
  memberToken: z.string().min(20),
});

export async function POST(request: Request) {
  const auth = await readMobileSession(request);
  if (!auth) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  if (!['OWNER', 'ADMIN', 'MANAGER'].includes(auth.membership.role)) {
    return NextResponse.json({ error: 'Staff access required.' }, { status: 403 });
  }

  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid event or member QR.' }, { status: 400 });
  }

  const qr = await verifyMemberQrToken(parsed.data.memberToken);
  if (!qr) return NextResponse.json({ error: 'This member QR is invalid or expired.' }, { status: 400 });
  if (qr.organizationId !== auth.membership.organizationId) {
    return NextResponse.json({ error: 'This member belongs to a different organization.' }, { status: 403 });
  }

  const member = await prisma.membership.findFirst({
    where: {
      id: qr.membershipId,
      userId: qr.userId,
      organizationId: auth.membership.organizationId,
    },
    include: { user: true },
  });
  if (!member || member.status !== 'ACTIVE') {
    return NextResponse.json({ error: 'Member is not active for check-in.' }, { status: 403 });
  }

  const rows = await prisma.$queryRawUnsafe<Array<{
    id: string;
    name: string;
    status: string;
    configJson: string;
  }>>(
    `SELECT id, name, status, configJson
     FROM WorkflowDefinition
     WHERE id = ? AND organizationId = ? AND kind = 'EVENT'
     LIMIT 1`,
    parsed.data.workflowId,
    auth.membership.organizationId,
  );

  const event = rows[0];
  if (!event || event.status !== 'ACTIVE') {
    return NextResponse.json({ error: 'Event is not active.' }, { status: 404 });
  }

  let config: Record<string, unknown> = {};
  try { config = JSON.parse(event.configJson || '{}'); } catch {}

  const checkinMode = String(config.checkinMode || 'SELF_SCAN');
  if (checkinMode !== 'STAFF_SCAN' && checkinMode !== 'BOTH') {
    return NextResponse.json({ error: 'This event is configured for member self-scan.' }, { status: 403 });
  }

  const credits = Number(config.ceuCredits || 0);
  const category = String(config.creditCategory || 'GENERAL');
  const checkedInAt = await recordEventAttendance({
    organizationId: auth.membership.organizationId,
    workflowId: event.id,
    userId: member.userId,
    eventName: event.name,
    category,
    credits: Number.isFinite(credits) ? credits : 0,
  });

  const certificateRule = String(config.certificateRule || 'NONE');
  let credentialCode: string | null = null;

  if (certificateRule === 'ATTENDANCE' || certificateRule === 'COMPLETE_EVENT') {
    const credentialName = `${event.name} Attendance Certificate`;
    const existing = await prisma.credential.findFirst({
      where: {
        organizationId: auth.membership.organizationId,
        userId: member.userId,
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
          organizationId: auth.membership.organizationId,
          userId: member.userId,
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
      organizationId: auth.membership.organizationId,
      actorId: auth.membership.userId,
      type: 'event.checked_in.staff_scan',
      message: `${auth.membership.user.name} checked in ${member.user.name} to ${event.name}${credits > 0 ? ` and awarded ${credits} ${category} credit(s)` : ''} by scanning the member QR.`,
    },
  });

  return NextResponse.json({
    ok: true,
    eventName: event.name,
    checkedInAt,
    credits: Number.isFinite(credits) ? credits : 0,
    category,
    credentialCode,
    member: {
      id: member.userId,
      name: member.user.name,
      email: member.user.email,
      status: member.status,
    },
    message: credits > 0
      ? `${member.user.name} checked in. ${credits} ${category} credit(s) were added.`
      : `${member.user.name} checked in successfully.`,
  });
}
