import { getCloudflareContext } from '@opennextjs/cloudflare';
import bcrypt from 'bcryptjs';
import { NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';
import { createPlatformSession, platformSessionCookie } from '../../../../lib/platform-auth';

type HandoffDatabase = {
  prepare(sql: string): {
    bind(...values: (string | number)[]): {
      first<T>(): Promise<T | null>;
    };
  };
};

const masterOrigins = new Set([
  'https://icomputeranything.com',
  'https://www.icomputeranything.com',
]);

export async function POST(request: Request) {
  const redirect = (path: string) => NextResponse.redirect(new URL(path, request.url), {
    status: 303,
    headers: { 'Cache-Control': 'no-store' },
  });
  const fallback = () => redirect('/platform/login');
  if (!masterOrigins.has(request.headers.get('origin') || '')) return fallback();
  if (!request.headers.get('content-type')?.startsWith('application/x-www-form-urlencoded')) return fallback();

  try {
    const form = new URLSearchParams(await request.text());
    const code = form.get('code');
    if (!code || !/^[0-9a-f]{64}$/.test(code)) return fallback();

    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(code));
    const codeHash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
    const now = Date.now();
    const { env } = getCloudflareContext();
    const db = (env as CloudflareEnv & { ICA_DB?: HandoffDatabase }).ICA_DB;
    if (!db) return fallback();

    // Delete and return in one statement, so simultaneous requests cannot reuse a code.
    const owner = await db.prepare(
      `DELETE FROM unified_owner_handoffs
       WHERE code_hash = ? AND expires_at > ?
         AND session_id IN (
           SELECT s.id FROM sessions s JOIN users u ON u.id = s.user_id
           WHERE s.expires_at > ? AND u.status = 'active' AND u.role = 'owner'
         )
       RETURNING (SELECT u.email FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = session_id) AS email,
                 (SELECT u.display_name FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = session_id) AS display_name`
    ).bind(codeHash, now, now).first<{ email: string; display_name: string | null }>();
    if (!owner?.email) return fallback();

    const name = owner.display_name || 'ICA Master Owner';
    const passwordHash = await bcrypt.hash(crypto.randomUUID() + crypto.randomUUID(), 12);
    const admin = await prisma.platformAdmin.upsert({
      where: { email: owner.email },
      update: { name, role: 'MASTER', active: true },
      create: { email: owner.email, name, passwordHash, role: 'MASTER', active: true },
    });
    const response = redirect('/platform');
    response.cookies.set(platformSessionCookie.name, await createPlatformSession({
      platformAdminId: admin.id,
      role: admin.role,
    }), platformSessionCookie.options);
    return response;
  } catch {
    console.error('ICA_UNIFIED_OWNER_HANDOFF_FAILURE');
    return fallback();
  }
}
