import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../../../../../lib/prisma';
import { createSession } from '../../../../../lib/auth';
import { consumeRateLimit, emailVerificationIsEnforced, isUserEmailVerified } from '../../../../../lib/security';

const schema = z.object({
  email: z.string().email().transform((value) => value.trim().toLowerCase()),
  password: z.string().min(8),
  organizationSlug: z.string().optional().transform((value) => (value || '').trim().toLowerCase()),
});

export async function POST(request: Request) {
  try {
    const body = schema.parse(await request.json());

    const limit = await consumeRateLimit(request, {
      scope: 'mobile-login',
      identity: body.email,
      limit: 10,
      windowSeconds: 15 * 60,
    });
    if (!limit.allowed) {
      return NextResponse.json(
        { error: 'Too many sign-in attempts. Try again later.' },
        { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } },
      );
    }

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
    const valid = Boolean(user && user.memberships.length > 0 && await bcrypt.compare(body.password, user.passwordHash));

    if (valid && !body.organizationSlug && user && user.memberships.length > 1) {
      return NextResponse.json({
        error: 'This email belongs to more than one ICA workspace. Enter the ICA Company ID.',
        code: 'COMPANY_ID_REQUIRED',
      }, { status: 409 });
    }

    if (!user || !membership || !valid) {
      return NextResponse.json({ error: 'Invalid company, email, or password.' }, { status: 401 });
    }

    if (emailVerificationIsEnforced() && !(await isUserEmailVerified(user.id))) {
      return NextResponse.json({ error: 'Verify your email before signing in.' }, { status: 403 });
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