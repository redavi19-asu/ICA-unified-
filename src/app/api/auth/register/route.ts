import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../../../../lib/prisma';
import { createSession, sessionCookie } from '../../../../lib/auth';

const schema = z.object({
  organizationName: z.string().min(2).max(100),
  organizationSlug: z.string().min(2).max(50).regex(/^[a-z0-9-]+$/),
  name: z.string().min(2).max(100),
  email: z.string().email().transform((value) => value.toLowerCase()),
  password: z.string().min(8).max(200),
});

export async function POST(request: Request) {
  try {
    const body = schema.parse(await request.json());
    const existingOrg = await prisma.organization.findUnique({ where: { slug: body.organizationSlug } });
    if (existingOrg) return NextResponse.json({ error: 'That company ID is already in use.' }, { status: 409 });

    const existingUser = await prisma.user.findUnique({ where: { email: body.email } });
    if (existingUser) return NextResponse.json({ error: 'That email already has an ICA Unified account. Sign in first.' }, { status: 409 });

    const passwordHash = await bcrypt.hash(body.password, 12);
    const trialEndsAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

    const result = await prisma.$transaction(async (tx) => {
      const organization = await tx.organization.create({
        data: {
          name: body.organizationName,
          slug: body.organizationSlug,
          status: 'TRIAL',
          plan: 'trial',
          trialEndsAt,
        },
      });

      const user = await tx.user.create({
        data: { name: body.name, email: body.email, passwordHash },
      });

      const membership = await tx.membership.create({
        data: {
          organizationId: organization.id,
          userId: user.id,
          role: 'OWNER',
          status: 'ACTIVE',
          jobTitle: 'Organization Owner',
        },
      });

      await tx.activity.create({
        data: {
          organizationId: organization.id,
          actorId: user.id,
          type: 'organization.created',
          message: `${body.organizationName} workspace created.`,
        },
      });

      return { organization, user, membership };
    });

    const token = await createSession({
      userId: result.user.id,
      organizationId: result.organization.id,
      organizationSlug: result.organization.slug,
      role: result.membership.role,
    });

    const response = NextResponse.json({ ok: true, organization: { name: result.organization.name, slug: result.organization.slug } });
    response.cookies.set(sessionCookie.name, token, sessionCookie.options);
    return response;
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Check the company name, company ID, email, and password.' }, { status: 400 });
    }
    return NextResponse.json({ error: 'Unable to create the organization.' }, { status: 500 });
  }
}
