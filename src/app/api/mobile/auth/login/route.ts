import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../../../../../lib/prisma';
import { createSession } from '../../../../../lib/auth';

const schema = z.object({
  email: z.string().email().transform((value) => value.trim().toLowerCase()),
  password: z.string().min(8),
  organizationSlug: z.string().optional().transform((value) => (value || '').trim().toLowerCase()),
});

export async function POST(request: Request) {
  try {
    const body = schema.parse(await request.json());

    const user = await prisma.user.findUnique({
      where: { email: body.email },
      include: {
        memberships: {
          ...(body.organizationSlug
            ? { where: { organization: { slug: body.organizationSlug } } }
            : {}),
          include: { organization: true },
        },
      },
    });

    const membership = user?.memberships[0];
    const valid = Boolean(user && membership && await bcrypt.compare(body.password, user.passwordHash));

    if (!user || !membership || !valid) {
      return NextResponse.json({ error: 'Invalid company, email, or password.' }, { status: 401 });
    }

    if (
      membership.status === 'SUSPENDED' ||
      membership.organization.status === 'SUSPENDED' ||
      membership.organization.status === 'CANCELLED'
    ) {
      return NextResponse.json({ error: 'This workspace or account is currently unavailable.' }, { status: 403 });
    }

    const token = await createSession({
      userId: user.id,
      organizationId: membership.organizationId,
      organizationSlug: membership.organization.slug,
      role: membership.role,
    });

    return NextResponse.json({
      ok: true,
      token,
      user: { id: user.id, name: user.name, email: user.email, role: membership.role },
      organization: { id: membership.organizationId, name: membership.organization.name, slug: membership.organization.slug },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Enter a valid email and password.' }, { status: 400 });
    }
    console.error('ICA_MOBILE_LOGIN_ERROR', error);
    return NextResponse.json({ error: 'Unable to sign in.' }, { status: 500 });
  }
}
