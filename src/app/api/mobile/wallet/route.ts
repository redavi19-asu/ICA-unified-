import { NextResponse } from 'next/server';
import { readMobileSession } from '../../../../lib/mobile-auth';
import { prisma } from '../../../../lib/prisma';
import { getMemberComplianceSummary } from '../../../../lib/compliance';

export async function GET(request: Request) {
  const auth = await readMobileSession(request);
  if (!auth) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });

  const organizationId = auth.membership.organizationId;
  const userId = auth.membership.userId;
  const [summary, credentials] = await Promise.all([
    getMemberComplianceSummary(organizationId, userId),
    prisma.credential.findMany({
      where: { organizationId, userId },
      orderBy: [{ expiresAt: 'asc' }, { issuedAt: 'desc' }],
    }),
  ]);

  return NextResponse.json({
    summary,
    credentials: credentials.map((item) => ({
      id: item.id,
      name: item.name,
      code: item.code,
      status: item.status,
      issuedAt: item.issuedAt,
      expiresAt: item.expiresAt,
    })),
  });
}
