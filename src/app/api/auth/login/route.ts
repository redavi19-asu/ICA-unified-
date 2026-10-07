import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../../../../lib/prisma';
import { createSession, sessionCookie } from '../../../../lib/auth';
import { createPlatformSession, platformSessionCookie } from '../../../../lib/platform-auth';
import { authenticateIcaMasterOwner } from '../../../../lib/ica-master-auth';
import { verifyTurnstile } from '../../../../lib/turnstile';
import { consumeRateLimit, emailVerificationIsEnforced, isUserEmailVerified } from '../../../../lib/security';

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

    const limit = await consumeRateLimit(request, {
      scope: 'web-login',
      identity: body.email,
      limit: 8,
      windowSeconds: 15 * 60,
    });
    if (!limit.allowed) {
      return NextResponse.json(
        { error: 'Too many sign-in attempts. Try again later.' },
        { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } },
      );
    }

    const challenge = await verifyTurnstile(body.turnstileToken, request, 'unified_login');
    if (!challenge.success) {
      return NextResponse.json(
        { error: 'Security verification failed. Please try again.' },
        { status: 403 }
      );
    }

    const master = await authenticateIcaMasterOwner(body.email, body.password);
    if (master) {
      const localOnlyHash = await bcrypt.hash(
        crypto.randomUUID() + crypto.randomUUID(),
        12
      );
      const admin = await prisma.platformAdmin.upsert({
        where: { email: master.email },
        update: {
          name: master.displayName,
          role: 'MASTER',
          active: true,
        },
        create: {
          email: master.email,
          name: master.displayName,
          passwordHash: localOnlyHash,
          role: 'MASTER',
          active: true,
        },
      });

      const token = await createPlatformSession({
        platformAdminId: admin.id,
        role: 'MASTER',
      });
      const response = NextResponse.json({
        ok: true,
        masterOwner: true,
        platform: true,
        admin: {
          name: admin.name,
          email: admin.email,
          role: 'MASTER',
        },
      });
      response.cookies.set(
        platformSessionCookie.name,
        token,
        platformSessionCookie.options
      );
      response.cookies.delete(sessionCookie.name);
      return response;
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
        user.memberships.length > 0 &&
        (await bcrypt.compare(body.password, user.passwordHash))
    );

    if (localPasswordValid && !body.organizationSlug && user && user.memberships.length > 1) {
      return NextResponse.json(
        {
          error: 'This email belongs to more than one ICA workspace. Enter the ICA Company ID to choose the correct organization.',
          code: 'COMPANY_ID_REQUIRED',
        },
        { status: 409 },
      );
    }

    if (!localPasswordValid) {
      return NextResponse.json(
        { error: 'Invalid company, email, or password.' },
        { status: 401 }
      );
    }

    if (!user || !membership) {
      return NextResponse.json(
        { error: 'Invalid company, email, or password.' },
        { status: 401 }
      );
    }

    if (emailVerificationIsEnforced() && !(await isUserEmailVerified(user.id))) {
      return NextResponse.json(
        { error: 'Verify your email before signing in.', code: 'EMAIL_VERIFICATION_REQUIRED' },
        { status: 403 },
      );
    }

    if (
      membership.status === 'SUSPENDED' ||
        membership.organization.status === 'SUSPENDED' ||
        membership.organization.status === 'CANCELLED'
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
      role: membership.role,
    });

    const response = NextResponse.json({
      ok: true,
      masterOwner: false,
      platform: false,
      user: {
        name: user.name,
        email: user.email,
        role: membership.role,
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