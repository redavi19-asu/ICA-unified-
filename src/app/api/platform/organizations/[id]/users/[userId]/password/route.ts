import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../../../../../../../lib/prisma';
import { readPlatformSession } from '../../../../../../../lib/platform-auth';

const schema = z.object({
  newPassword: z.string().min(12),
});

export async function POST(
  request: Request,
  props: { params: Promise<{ id: string; userId: string }> }
) {
  const { id, userId } = await props.params;
  const session = await readPlatformSession();

  if (!session || session.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Super administrator access required.' }, { status: 403 });
  }

  const admin = await prisma.platformAdmin.findFirst({
    where: { id: session.platformAdminId, active: true, role: 'SUPER_ADMIN' },
  });

  if (!admin) {
    return NextResponse.json({ error: 'Super administrator access required.' }, { status: 403 });
  }

  const membership = await prisma.membership.findFirst({
    where: { organizationId: id, userId },
    include: { user: true },
  });

  if (!membership) {
    return NextResponse.json({ error: 'User not found in this organization.' }, { status: 404 });
  }

  try {
    const form = await request.formData();
    const { newPassword } = schema.parse({ newPassword: form.get('newPassword') });
    const passwordHash = await bcrypt.hash(newPassword, 12);

    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });

    await prisma.activity.create({
      data: {
        organizationId: id,
        type: 'PLATFORM_PASSWORD_RESET',
        message: `Password reset by platform Super Admin for ${membership.user.email}`,
      },
    });

    return NextResponse.redirect(
      new URL(`/platform/organizations/${id}?passwordReset=1`, request.url),
      { status: 303 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Temporary password must be at least 12 characters.' }, { status: 400 });
    }

    console.error('ICA_PLATFORM_PASSWORD_RESET_ERROR', error);
    return NextResponse.json({ error: 'Unable to reset password.' }, { status: 500 });
  }
}
