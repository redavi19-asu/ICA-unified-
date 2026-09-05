import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../../../../lib/prisma';
import { readPlatformSession } from '../../../../lib/platform-auth';

const schema = z.object({
  currentPassword: z.string().min(8),
  newPassword: z.string().min(12),
});

export async function POST(request: Request) {
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

  try {
    const form = await request.formData();
    const { currentPassword, newPassword } = schema.parse({
      currentPassword: form.get('currentPassword'),
      newPassword: form.get('newPassword'),
    });

    const matches = await bcrypt.compare(currentPassword, admin.passwordHash);
    if (!matches) {
      return NextResponse.json({ error: 'Current password is incorrect.' }, { status: 401 });
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await prisma.platformAdmin.update({
      where: { id: admin.id },
      data: { passwordHash },
    });

    return NextResponse.redirect(new URL('/platform?passwordChanged=1', request.url), { status: 303 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'New password must be at least 12 characters.' }, { status: 400 });
    }

    console.error('ICA_PLATFORM_ADMIN_PASSWORD_CHANGE_ERROR', error);
    return NextResponse.json({ error: 'Unable to change Super Admin password.' }, { status: 500 });
  }
}
