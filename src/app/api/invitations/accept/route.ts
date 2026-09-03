import { createHash } from 'crypto';
import bcrypt from 'bcryptjs';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '../../../../lib/prisma';
import { createSession, sessionCookie } from '../../../../lib/auth';

const acceptSchema = z.object({
  token: z.string().min(20),
  password: z.string().min(8).max(128),
});

export async function POST(request: Request) {
  const parsed = acceptSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: 'Use a password with at least 8 characters.' }, { status: 400 });
  }

  const tokenHash = createHash('sha256').update(parsed.data.token).digest('hex');
  const invitation = await prisma.invitation.findUnique({
    where: { tokenHash },
    include: { organization: true },
  });

  if (!invitation || invitation.status !== 'PENDING') {
    return NextResponse.json({ error: 'This invitation is no longer valid.' }, { status: 400 });
  }
  if (invitation.expiresAt.getTime() < Date.now()) {
    await prisma.invitation.update({ where: { id: invitation.id }, data: { status: 'EXPIRED' } });
    return NextResponse.json({ error: 'This invitation has expired.' }, { status: 400 });
  }

  const existingUser = await prisma.user.findUnique({ where: { email: invitation.email } });
  if (existingUser) {
    const passwordMatches = await bcrypt.compare(parsed.data.password, existingUser.passwordHash);
    if (!passwordMatches) {
      return NextResponse.json({ error: 'Use your existing ICA Unified password to accept this invitation.' }, { status: 401 });
    }
  }

  const passwordHash = existingUser ? null : await bcrypt.hash(parsed.data.password, 12);

  const result = await prisma.$transaction(async (tx) => {
    let user = existingUser;
    if (!user) {
      user = await tx.user.create({
        data: { email: invitation.email, name: invitation.name, passwordHash: passwordHash! },
      });
    }

    const membership = await tx.membership.upsert({
      where: { userId_organizationId: { userId: user.id, organizationId: invitation.organizationId } },
      update: { role: invitation.role, status: 'ONBOARDING', jobTitle: invitation.jobTitle },
      create: {
        userId: user.id,
        organizationId: invitation.organizationId,
        role: invitation.role,
        status: 'ONBOARDING',
        jobTitle: invitation.jobTitle,
      },
    });

    await tx.invitation.update({
      where: { id: invitation.id },
      data: { status: 'ACCEPTED', acceptedAt: new Date() },
    });

    await tx.activity.create({
      data: {
        organizationId: invitation.organizationId,
        actorId: user.id,
        type: 'PEOPLE_INVITE_ACCEPTED',
        message: `${user.name} joined ${invitation.organization.name}.`,
      },
    });

    return { user, membership };
  });

  const token = await createSession({
    userId: result.user.id,
    organizationId: invitation.organizationId,
    organizationSlug: invitation.organization.slug,
    role: result.membership.role,
  });

  const response = NextResponse.json({ ok: true, redirectTo: '/workspace' });
  response.cookies.set(sessionCookie.name, token, sessionCookie.options);
  return response;
}
