import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../../../../lib/prisma';
import { createSession, sessionCookie } from '../../../../lib/auth';

const loginSchema = z.object({
  email: z.string().email().transform((value) => value.toLowerCase()),
  password: z.string().min(8),
  organizationSlug: z.string().min(2).transform((value) => value.toLowerCase()),
});

export async function POST(request: Request) {
  try {
    const body = loginSchema.parse(await request.json());

    const user = await prisma.user.findUnique({
      where: { email: body.email },
      include: {
        memberships: {
          where: { organization: { slug: body.organizationSlug } },
          include: { organization: true },
        },
      },
    });

    const membership = user?.memberships[0];
    if (!user || !membership || !(await bcrypt.compare(body.password, user.passwordHash))) {
      return NextResponse.json({ error: 'Invalid company, email, or password.' }, { status: 401 });
    }

    const token = await createSession({
      userId: user.id,
      organizationId: membership.organizationId,
      organizationSlug: membership.organization.slug,
      role: membership.role,
    });

    const response = NextResponse.json({
      ok: true,
      user: { name: user.name, email: user.email, role: membership.role },
      organization: { name: membership.organization.name, slug: membership.organization.slug },
    });

    response.cookies.set(sessionCookie.name, token, sessionCookie.options);
    return response;
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Enter a valid company ID, email, and password.' }, { status: 400 });
    }
    return NextResponse.json({ error: 'Unable to sign in.' }, { status: 500 });
  }
}
