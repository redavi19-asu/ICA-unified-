import { getCloudflareContext } from '@opennextjs/cloudflare';

type Grant = { email: string; expires_at: number | null };
interface GrantDatabase { prepare(sql: string): { bind(...values: (string | number)[]): { first(): Promise<unknown> } } }

export async function unifiedFreeAccess(email: string) {
  if (!email) return null;
  try {
    const { env } = getCloudflareContext();
    const database = (env as unknown as { ICA_DB?: GrantDatabase }).ICA_DB;
    if (!database) return null;
    return await readUnifiedEmailGrant(database, email);
  } catch {
    console.error('ICA Unified free-access lookup unavailable');
    return null;
  }
}

export async function organizationFreeAccess(organizationId: string, userEmail?: string) {
  // An owner's grant covers the organization they operate. A member's grant stays personal.
  const { prisma } = await import('./prisma');
  if (userEmail) {
    const grant = await unifiedFreeAccess(userEmail);
    if (grant) return grant;
  }
  const owners = await prisma.membership.findMany({
    where: { organizationId, role: 'OWNER', status: 'ACTIVE' },
    include: { user: true },
  });
  for (const owner of owners) {
    const grant = await unifiedFreeAccess(owner.user.email);
    if (grant) return grant;
  }
  return null;
}

export async function readUnifiedEmailGrant(database: GrantDatabase, email: string, now = Date.now()) {
  return await database.prepare(`SELECT email, expires_at FROM email_access_grants
      WHERE email=? AND product_slug='ica-unified' AND status='active'
      AND (expires_at IS NULL OR expires_at > ?) LIMIT 1`)
      .bind(email.trim().toLowerCase(), now).first() as Grant | null;
}
