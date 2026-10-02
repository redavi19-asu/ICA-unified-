import bcrypt from 'bcryptjs';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '../../../../lib/prisma';
import {
  consumeRateLimit,
  consumeSecurityToken,
  invalidatePrincipalSessions,
} from '../../../../lib/security';

const schema = z.object({
  token: z.string().min(20),
  password: z.string().min(12).max(200),
});

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: 'Use a password with at least 12 characters.' }, { status: 400 });
  }

  const limit = await consumeRateLimit(request, {
    scope: 'reset-password',
    limit: 8,
    windowSeconds: 60 * 60,
  });
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'Too many reset attempts. Try again later.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } },
    );
  }

  const userId = await consumeSecurityToken(parsed.data.token, 'PASSWORD_RESET');
  if (!userId) {
    return NextResponse.json({ error: 'This reset link is invalid or expired.' }, { status: 400 });
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 12);
  await prisma.user.update({ where: { id: userId }, data: { passwordHash } });
  await invalidatePrincipalSessions('user', userId);
  return NextResponse.json({ ok: true });
}
