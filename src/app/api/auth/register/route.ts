import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { z } from 'zod';
import { prisma } from '../../../../lib/prisma';
import { createSession, sessionCookie } from '../../../../lib/auth';
import { verifyTurnstile } from '../../../../lib/turnstile';
import { queueEmail } from '../../../../lib/organization-ops';
import {
  consumeRateLimit,
  createSecurityToken,
  emailVerificationIsEnforced,
  ensureUserSecurityState,
} from '../../../../lib/security';

const schema = z.object({
  organizationName: z.string().trim().min(2).max(100),
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().email().transform((value) => value.toLowerCase()),
  password: z.string().min(12).max(200),
  turnstileToken: z.string().optional(),
});

async function issueCompanyId() {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const code = `ica-${randomBytes(3).toString('hex')}`;
    const existing = await prisma.organization.findUnique({ where: { slug: code } });
    if (!existing) return code;
  }
  throw new Error('Unable to issue a unique ICA Company ID.');
}

export async function POST(request: Request) {
  try {
    const body = schema.parse(await request.json());

    const limit = await consumeRateLimit(request, {
      scope: 'register',
      identity: body.email,
      limit: 5,
      windowSeconds: 60 * 60,
    });
    if (!limit.allowed) {
      return NextResponse.json(
        { error: 'Too many account creation attempts. Try again later.' },
        { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } },
      );
    }

    const challenge = await verifyTurnstile(body.turnstileToken, request);
    if (!challenge.success) {
      return NextResponse.json(
        { error: challenge.configured ? 'Security verification failed. Please try again.' : 'Security verification is temporarily unavailable.' },
        { status: 403 },
      );
    }

    const existingUser = await prisma.user.findUnique({ where: { email: body.email } });
    if (existingUser) {
      return NextResponse.json(
        { error: 'That email already has an ICA Unified account. Sign in first.' },
        { status: 409 },
      );
    }

    const [companyId, passwordHash] = await Promise.all([
      issueCompanyId(),
      bcrypt.hash(body.password, 12),
    ]);
    const trialEndsAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

    // Organization + owner identity + membership are created in one nested Prisma write.
    // If any nested record fails, Prisma rolls the mutation back instead of leaving a partial tenant.
    const organization = await prisma.organization.create({
      data: {
        name: body.organizationName,
        slug: companyId,
        status: 'TRIAL',
        plan: 'trial',
        trialEndsAt,
        memberships: {
          create: {
            role: 'OWNER',
            status: 'ACTIVE',
            jobTitle: 'Organization Owner',
            user: {
              create: {
                name: body.name,
                email: body.email,
                passwordHash,
              },
            },
          },
        },
      },
      include: {
        memberships: {
          include: { user: true },
          take: 1,
        },
      },
    });

    const membership = organization.memberships[0];
    const user = membership?.user;
    if (!membership || !user) throw new Error('OWNER_CREATION_FAILED');

    await prisma.activity.create({
      data: {
        organizationId: organization.id,
        actorId: user.id,
        type: 'organization.created',
        message: `${body.organizationName} workspace created.`,
      },
    });

    const verificationRequired = emailVerificationIsEnforced();
    await ensureUserSecurityState(user.id, !verificationRequired);

    if (verificationRequired) {
      const verificationToken = await createSecurityToken(user.id, 'EMAIL_VERIFY', 24 * 60 * 60);
      const verifyUrl = `${new URL(request.url).origin}/api/auth/verify-email?token=${encodeURIComponent(verificationToken)}`;
      await queueEmail({
        organizationId: organization.id,
        recipient: user.email,
        templateKey: 'EMAIL_VERIFICATION',
        subject: 'Verify your ICA Unified email',
        bodyText:
          `Hello ${user.name},\n\nVerify your email to activate your ICA Unified trial:\n\n${verifyUrl}\n\nThis link expires in 24 hours.\n\nICA Unified · Built by I Computer Anything`,
      });
    }

    const token = await createSession({
      userId: user.id,
      organizationId: organization.id,
      organizationSlug: organization.slug,
      role: membership.role,
    });

    const response = NextResponse.json({
      ok: true,
      verificationRequired,
      organization: {
        name: organization.name,
        slug: organization.slug,
        companyId: organization.slug.toUpperCase(),
      },
    });

    response.cookies.set(sessionCookie.name, token, sessionCookie.options);
    return response;
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Check the company name, email, 12+ character password, and security verification.' },
        { status: 400 },
      );
    }

    console.error('ICA_REGISTER_ERROR', error);
    return NextResponse.json({ error: 'Unable to create the organization.' }, { status: 500 });
  }
}
