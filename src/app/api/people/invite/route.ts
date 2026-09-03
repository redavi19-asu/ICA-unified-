import { createHash, randomBytes } from 'crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSession } from '../../../../lib/auth';
import { prisma } from '../../../../lib/prisma';

const inviteSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().email().toLowerCase(),
  jobTitle: z.string().trim().max(100).optional().or(z.literal('')),
  role: z.enum(['ADMIN', 'MANAGER', 'MEMBER']),
});

export async function POST(request: Request) {
  const { membership } = await requireSession();

  if (!['OWNER', 'ADMIN'].includes(membership.role)) {
    return NextResponse.json({ error: 'You do not have permission to invite people.' }, { status: 403 });
  }

  const parsed = inviteSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: 'Please check the name, email, job title, and role.' }, { status: 400 });
  }

  const { name, email, jobTitle, role } = parsed.data;
  const organizationId = membership.organizationId;

  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) {
    const existingMembership = await prisma.membership.findUnique({
      where: { userId_organizationId: { userId: existingUser.id, organizationId } },
    });
    if (existingMembership) {
      return NextResponse.json({ error: 'That person already belongs to this company.' }, { status: 409 });
    }
  }

  await prisma.invitation.updateMany({
    where: { organizationId, email, status: 'PENDING' },
    data: { status: 'REVOKED' },
  });

  const token = randomBytes(32).toString('hex');
  const tokenHash = createHash('sha256').update(token).digest('hex');
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 72);

  await prisma.invitation.create({
    data: {
      organizationId,
      email,
      name,
      jobTitle: jobTitle || null,
      role,
      tokenHash,
      expiresAt,
      invitedById: membership.userId,
    },
  });

  await prisma.activity.create({
    data: {
      organizationId,
      actorId: membership.userId,
      type: 'PEOPLE_INVITE_CREATED',
      message: `${name} was invited as ${role.toLowerCase()}.`,
    },
  });

  const origin = new URL(request.url).origin;
  return NextResponse.json({ inviteUrl: `${origin}/invite/${token}` }, { status: 201 });
}
