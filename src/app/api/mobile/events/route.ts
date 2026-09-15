import { NextResponse } from 'next/server';
import { readMobileSession } from '../../../../lib/mobile-auth';
import { prisma } from '../../../../lib/prisma';

export async function GET(request: Request) {
  const auth = await readMobileSession(request);
  if (!auth) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  if (!['OWNER', 'ADMIN', 'MANAGER'].includes(auth.membership.role)) {
    return NextResponse.json({ error: 'Staff access required.' }, { status: 403 });
  }

  const rows = await prisma.$queryRawUnsafe<Array<{
    id: string;
    name: string;
    status: string;
    configJson: string;
    updatedAt: string;
  }>>(
    `SELECT id, name, status, configJson, updatedAt
     FROM WorkflowDefinition
     WHERE organizationId = ? AND kind = 'EVENT' AND status = 'ACTIVE'
     ORDER BY datetime(updatedAt) DESC`,
    auth.membership.organizationId,
  );

  const events = rows.flatMap((row) => {
    let config: Record<string, unknown> = {};
    try { config = JSON.parse(row.configJson || '{}'); } catch {}

    const checkinMode = String(config.checkinMode || 'SELF_SCAN');
    if (checkinMode !== 'STAFF_SCAN' && checkinMode !== 'BOTH') return [];

    return [{
      id: row.id,
      name: row.name,
      status: row.status,
      startAt: typeof config.startAt === 'string' ? config.startAt : '',
      checkinMode,
      credits: Number(config.ceuCredits || 0),
      category: String(config.creditCategory || 'GENERAL'),
    }];
  });

  return NextResponse.json({ ok: true, events });
}
