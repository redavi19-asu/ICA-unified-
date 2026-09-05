import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../../../../lib/prisma';
import { createPlatformSession, platformSessionCookie } from '../../../../lib/platform-auth';
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
      return NextResponse.json({ error: 'Security verification failed. Please try again.' }, { status: 403 });
    }
    const admin = await prisma.platformAdmin.findUnique({ where: { email: body.email } });

    if (!admin || !admin.active || !(await bcrypt.compare(body.password, admin.passwordHash))) {
      return NextResponse.json({ error: 'Invalid platform administrator credentials.' }, { status: 401 });
    }

    const token = await createPlatformSession({ platformAdminId: admin.id, role: admin.role });
    const response = NextResponse.json({ ok: true, admin: { name: admin.name, email: admin.email, role: admin.role } });
    response.cookies.set(platformSessionCookie.name, token, platformSessionCookie.options);
    return response;
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Enter a valid email and password.' }, { status: 400 });
    }
    return NextResponse.json({ error: 'Unable to sign in to platform control.' }, { status: 500 });
  }
}
