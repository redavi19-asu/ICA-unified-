import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../../../../lib/prisma';
import { createPlatformSession, platformSessionCookie } from '../../../../lib/platform-auth';
import { authenticateIcaMasterOwner } from '../../../../lib/ica-master-auth';
import { verifyTurnstile } from '../../../../lib/turnstile';
import { consumeRateLimit } from '../../../../lib/security';

const schema = z.object({
  email: z.string().email().transform((value) => value.toLowerCase()),
  password: z.string().min(8),
  turnstileToken: z.string().optional(),
});

export async function POST(request: Request) {
  try {
    const body = schema.parse(await request.json());

    const limit = await consumeRateLimit(request, {
      scope: 'platform-login',
      identity: body.email,
      limit: 5,
      windowSeconds: 15 * 60,
    });
    if (!limit.allowed) {
      return NextResponse.json(
        { error: 'Too many platform sign-in attempts. Try again later.' },
        { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } },
      );
    }

    const challenge = await verifyTurnstile(body.turnstileToken, request, 'unified_platform_login');
    if (!challenge.success) {
      return NextResponse.json(
        { error: 'Security verification failed. Please try again.' },
        { status: 403 }
      );
    }

    let admin = await prisma.platformAdmin.findUnique({
      where: { email: body.email },
    });

    const localPasswordValid = Boolean(
      admin &&
        admin.active &&
        (await bcrypt.compare(body.password, admin.passwordHash))
    );

    let masterOwner = false;

    const master = await authenticateIcaMasterOwner(body.email, body.password);
    if (master) {
      masterOwner = true;

      const localOnlyHash = await bcrypt.hash(
        crypto.randomUUID() + crypto.randomUUID(),
        12
      );

      admin = await prisma.platformAdmin.upsert({
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
    } else if (admin?.role === 'SUPER_ADMIN' && localPasswordValid) {
      admin = await prisma.platformAdmin.update({
        where: { id: admin.id },
        data: { role: 'MASTER' },
      });
    } else if (!localPasswordValid) {
      return NextResponse.json(
        { error: 'Invalid ICA Master or platform administrator credentials.' },
        { status: 401 }
      );
    }

    if (!admin || !admin.active) {
      return NextResponse.json(
        { error: 'Invalid platform administrator credentials.' },
        { status: 401 }
      );
    }

    const token = await createPlatformSession({
      platformAdminId: admin.id,
      role: masterOwner ? 'MASTER' : admin.role,
    });

    const response = NextResponse.json({
      ok: true,
      masterOwner,
      admin: {
        name: admin.name,
        email: admin.email,
        role: masterOwner ? 'MASTER' : admin.role,
      },
    });

    response.cookies.set(
      platformSessionCookie.name,
      token,
      platformSessionCookie.options
    );

    return response;
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Enter a valid email and password.' },
        { status: 400 }
      );
    }

    console.error('ICA_UNIFIED_PLATFORM_LOGIN_ERROR', error);
    return NextResponse.json(
      { error: 'Unable to sign in to platform control.' },
      { status: 500 }
    );
  }
}
