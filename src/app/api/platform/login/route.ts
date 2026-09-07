import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../../../../lib/prisma';
import { createPlatformSession, platformSessionCookie } from '../../../../lib/platform-auth';
import { authenticateIcaMasterOwner } from '../../../../lib/ica-master-auth';
import { verifyTurnstile } from '../../../../lib/turnstile';

const schema = z.object({
  email: z.string().email().transform((value) => value.toLowerCase()),
  password: z.string().min(8),
  turnstileToken: z.string().optional(),
});

export async function POST(request: Request) {
  try {
    const body = schema.parse(await request.json());

    const challenge = await verifyTurnstile(body.turnstileToken, request);
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

    if (!localPasswordValid) {
      const master = await authenticateIcaMasterOwner(body.email, body.password);

      if (!master) {
        return NextResponse.json(
          { error: 'Invalid platform administrator credentials.' },
          { status: 401 }
        );
      }

      masterOwner = true;

      const localOnlyHash = await bcrypt.hash(
        crypto.randomUUID() + crypto.randomUUID(),
        12
      );

      admin = await prisma.platformAdmin.upsert({
        where: { email: master.email },
        update: {
          name: master.displayName,
          role: 'SUPER_ADMIN',
          active: true,
        },
        create: {
          email: master.email,
          name: master.displayName,
          passwordHash: localOnlyHash,
          role: 'SUPER_ADMIN',
          active: true,
        },
      });
    }

    if (!admin || !admin.active) {
      return NextResponse.json(
        { error: 'Invalid platform administrator credentials.' },
        { status: 401 }
      );
    }

    const token = await createPlatformSession({
      platformAdminId: admin.id,
      role: masterOwner ? 'SUPER_ADMIN' : admin.role,
    });

    const response = NextResponse.json({
      ok: true,
      masterOwner,
      admin: {
        name: admin.name,
        email: admin.email,
        role: masterOwner ? 'SUPER_ADMIN' : admin.role,
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
