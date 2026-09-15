import { NextResponse } from 'next/server';
import { readMobileSession } from '../../../../lib/mobile-auth';
import { prisma } from '../../../../lib/prisma';

export async function GET(request: Request) {
  const auth = await readMobileSession(request);
  if (!auth) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });

  const staff = ['OWNER', 'ADMIN', 'MANAGER'].includes(auth.membership.role);
  const activities = await prisma.activity.findMany({
    where: {
      organizationId: auth.membership.organizationId,
      ...(staff ? {} : { actorId: auth.membership.userId }),
    },
    orderBy: { createdAt: 'desc' },
    take: 30,
  });

  return NextResponse.json({
    notifications: activities.map((item) => ({
      id: item.id,
      type: item.type,
      message: item.message,
      createdAt: item.createdAt,
    })),
  });
}
