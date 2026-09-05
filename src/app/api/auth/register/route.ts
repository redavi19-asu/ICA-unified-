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
  let organizationId: string | null = null;
  let userId: string | null = null;

  try {
    const body = schema.parse(await request.json());

    const existingOrg = await prisma.organization.findUnique({
      where: { slug: body.organizationSlug },
    });

    if (existingOrg) {
      return NextResponse.json(
        { error: 'That company ID is already in use.' },
        { status: 409 }
      );
    }

    const existingUser = await prisma.user.findUnique({
      where: { email: body.email },
    });

    if (existingUser) {
      return NextResponse.json(
        { error: 'That email already has an ICA Unified account. Sign in first.' },
        { status: 409 }
      );
    }

    const passwordHash = await bcrypt.hash(body.password, 12);
    const trialEndsAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

    const organization = await prisma.organization.create({
      data: {
        name: body.organizationName,
        slug: body.organizationSlug,
        status: 'TRIAL',
        plan: 'trial',
        trialEndsAt,
      },
    });

    organizationId = organization.id;

    const user = await prisma.user.create({
      data: {
        name: body.name,
        email: body.email,
        passwordHash,
      },
    });

    userId = user.id;

    const membership = await prisma.membership.create({
      data: {
        organizationId: organization.id,
        userId: user.id,
        role: 'OWNER',
        status: 'ACTIVE',
        jobTitle: 'Organization Owner',
      },
    });

    await prisma.activity.create({
      data: {
        organizationId: organization.id,
        actorId: user.id,
        type: 'organization.created',
        message: `${body.organizationName} workspace created.`,
      },
    });

    const token = await createSession({
      userId: user.id,
      organizationId: organization.id,
      organizationSlug: organization.slug,
      role: membership.role,
    });

    const response = NextResponse.json({
      ok: true,
      organization: {
        name: organization.name,
        slug: organization.slug,
      },
    });

    response.cookies.set(
      sessionCookie.name,
      token,
      sessionCookie.options
    );

    return response;
  } catch (error) {
    console.error('ICA_REGISTER_ERROR', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Check the company name, company ID, email, and password.' },
        { status: 400 }
      );
    }

    // Best-effort cleanup if registration stopped halfway through.
    try {
      if (organizationId) {
        await prisma.activity.deleteMany({
          where: { organizationId },
        });

        await prisma.membership.deleteMany({
          where: { organizationId },
        });
      }

      if (userId) {
        await prisma.user.delete({
          where: { id: userId },
        });
      }

      if (organizationId) {
        await prisma.organization.delete({
          where: { id: organizationId },
        });
      }
    } catch (cleanupError) {
      console.error('ICA_REGISTER_CLEANUP_ERROR', cleanupError);
    }

    return NextResponse.json(
      { error: 'Unable to create the organization.' },
      { status: 500 }
    );
  }
}
