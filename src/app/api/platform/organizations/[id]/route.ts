import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '../../../../../lib/prisma';
import { readPlatformSession } from '../../../../../lib/platform-auth';

const bodySchema = z.object({
  status: z.enum(['TRIAL', 'ACTIVE', 'SUSPENDED', 'CANCELLED']),
});

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const session = await readPlatformSession();
  if (!session || !['SUPER_ADMIN', 'PLATFORM_ADMIN'].includes(session.role)) {
    return NextResponse.json({ error: 'Platform administrator access required.' }, { status: 403 });
  }

  const admin = await prisma.platformAdmin.findFirst({ where: { id: session.platformAdminId, active: true } });
  if (!admin) return NextResponse.json({ error: 'Platform administrator access required.' }, { status: 403 });

  try {
    const form = await request.formData();
    const { status } = bodySchema.parse({ status: form.get('status') });
    await prisma.organization.update({ where: { id: params.id }, data: { status } });
    return NextResponse.redirect(new URL('/platform', request.url), { status: 303 });
  } catch {
    return NextResponse.json({ error: 'Unable to update organization status.' }, { status: 400 });
  }
}
