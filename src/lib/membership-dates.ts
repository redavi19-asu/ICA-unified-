import { prisma } from './prisma';
import { parseStoredDate } from './display-time';

export async function readMembershipJoinDate(membership: { id: string; joinedAt: Date }): Promise<Date | null> {
  const parsed = parseStoredDate(membership.joinedAt);
  if (parsed) return parsed;
  const rows = await prisma.$queryRawUnsafe<Array<{ joinedAt: string }>>(
    'SELECT CAST(joinedAt AS TEXT) AS joinedAt FROM Membership WHERE id = ?', membership.id,
  );
  return rows[0] ? parseStoredDate(rows[0].joinedAt) : null;
}
