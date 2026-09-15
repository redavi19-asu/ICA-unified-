import { NextResponse } from 'next/server';
import { readMobileSession } from '../../../../lib/mobile-auth';
import { prisma } from '../../../../lib/prisma';

export async function GET(request: Request) {
  const auth = await readMobileSession(request);
  if (!auth) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  if (!['OWNER', 'ADMIN', 'MANAGER'].includes(auth.membership.role)) {
    return NextResponse.json({ error: 'Member lookup requires staff access.' }, { status: 403 });
  }

  const query = new URL(request.url).searchParams.get('q')?.trim() || '';
  if (query.length < 2) return NextResponse.json({ members: [] });

  const rows = await prisma.membership.findMany({
    where: {
      organizationId: auth.membership.organizationId,
      OR: [
        { user: { name: { contains: query } } },
        { user: { email: { contains: query } } },
        { jobTitle: { contains: query } },
      ],
    },
    include: { user: true },
    orderBy: { joinedAt: 'asc' },
    take: 25,
  });

  return NextResponse.json({
    members: rows.map((item) => ({
      id: item.userId,
      membershipId: item.id,
      name: item.user.name,
      email: item.user.email,
      role: item.role,
      status: item.status,
      jobTitle: item.jobTitle,
      joinedAt: item.joinedAt,
    })),
  });
}
