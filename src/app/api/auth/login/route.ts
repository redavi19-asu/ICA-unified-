import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../../../../lib/prisma';
import { createSession, sessionCookie } from '../../../../lib/auth';
import { authenticateIcaMasterOwner } from '../../../../lib/ica-master-auth';
import { verifyTurnstile } from '../../../../lib/turnstile';

const loginSchema = z.object({
  email: z.string().email().transform((value) => value.toLowerCase()),
  password: z.string().min(8),
  organizationSlug: z
    .string()
    .optional()
    .transform((value) => (value || '').trim().toLowerCase()),
  turnstileToken: z.string().optional(),
});

export async function POST(request: Request) {
  try {
    const body = loginSchema.parse(await request.json());

    const challenge = await verifyTurnstile(body.turnstileToken, request);
    if (!challenge.success) {
      return NextResponse.json(
        { error: 'Security verification failed. Please try again.' },
        { status: 403 }
      );
    }

    let user = await prisma.user.findUnique({
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

    let membership = user?.memberships[0];
    const localPasswordValid = Boolean(
      user &&
        membership &&
        (await bcrypt.compare(body.password, user.passwordHash))
    );

    let masterOwner = false;

    if (!localPasswordValid) {
      const master = await authenticateIcaMasterOwner(body.email, body.password);

      if (!master) {
        return NextResponse.json(
          { error: 'Invalid company, email, or password.' },
          { status: 401 }
        );
      }

      masterOwner = true;

      let localUser = await prisma.user.findUnique({
        where: { email: master.email },
        include: { memberships: { include: { organization: true } } },
      });

      if (!localUser) {
        const localOnlyHash = await bcrypt.hash(
          crypto.randomUUID() + crypto.randomUUID(),
          12
        );

        localUser = await prisma.user.create({
          data: {
            email: master.email,
            name: master.displayName,
            passwordHash: localOnlyHash,
          },
          include: { memberships: { include: { organization: true } } },
        });
      }

      let organization =
        body.organizationSlug
          ? await prisma.organization.findUnique({
              where: { slug: body.organizationSlug },
            })
          : localUser.memberships[0]?.organization || null;

      if (!organization) {
        organization = await prisma.organization.upsert({
          where: { slug: 'ica-master' },
          update: {
            name: 'ICA Master Workspace',
            status: 'ACTIVE',
            plan: 'internal',
          },
          create: {
            name: 'ICA Master Workspace',
            slug: 'ica-master',
            status: 'ACTIVE',
            plan: 'internal',
          },
        });
      }

      membership = await prisma.membership.upsert({
        where: {
          userId_organizationId: {
            userId: localUser.id,
            organizationId: organization.id,
          },
        },
        update: {
          role: 'OWNER',
          status: 'ACTIVE',
          jobTitle: 'ICA Master Owner',
        },
        create: {
          userId: localUser.id,
          organizationId: organization.id,
          role: 'OWNER',
          status: 'ACTIVE',
          jobTitle: 'ICA Master Owner',
        },
        include: { organization: true },
      });

      user = {
        ...localUser,
        memberships: [membership],
      };
    }

    if (!user || !membership) {
      return NextResponse.json(
        { error: 'Invalid company, email, or password.' },
        { status: 401 }
      );
    }

    if (
      !masterOwner &&
      (
        membership.status === 'SUSPENDED' ||
        membership.organization.status === 'SUSPENDED' ||
        membership.organization.status === 'CANCELLED'
      )
    ) {
      return NextResponse.json(
        { error: 'This workspace or account is currently unavailable.' },
        { status: 403 }
      );
    }

    const token = await createSession({
      userId: user.id,
      organizationId: membership.organizationId,
      organizationSlug: membership.organization.slug,
      role: masterOwner ? 'OWNER' : membership.role,
    });

    const response = NextResponse.json({
      ok: true,
      masterOwner,
      user: {
        name: user.name,
        email: user.email,
        role: masterOwner ? 'OWNER' : membership.role,
      },
      organization: {
        name: membership.organization.name,
        slug: membership.organization.slug,
      },
    });

    response.cookies.set(sessionCookie.name, token, sessionCookie.options);
    return response;
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Enter a valid email and password. Company ID is optional for the ICA Master owner.' },
        { status: 400 }
      );
    }

    console.error('ICA_UNIFIED_LOGIN_ERROR', error);
    return NextResponse.json({ error: 'Unable to sign in.' }, { status: 500 });
  }
}
