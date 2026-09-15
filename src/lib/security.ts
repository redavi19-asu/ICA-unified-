import { createHash, randomBytes, randomUUID } from 'crypto';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { emailDeliveryConfigured } from './email-delivery';

type RateLimitInput = {
  scope: string;
  identity?: string;
  limit: number;
  windowSeconds: number;
};

function db() {
  const { env } = getCloudflareContext();
  const database = (env as any).DB;
  if (!database) throw new Error('ICA application database is not available.');
  return database;
}

function ipFor(request: Request) {
  return (
    request.headers.get('cf-connecting-ip') ||
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    'unknown'
  );
}

function digest(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

export function emailVerificationIsEnforced() {
  return emailDeliveryConfigured();
}

export async function consumeRateLimit(request: Request, input: RateLimitInput) {
  const now = Date.now();
  const nextReset = now + input.windowSeconds * 1000;
  const bucketKey = digest(
    `${input.scope}|${ipFor(request)}|${String(input.identity || '').trim().toLowerCase()}`,
  );
  const database = db();

  await database.prepare(
    `INSERT INTO RateLimitBucket (bucketKey, count, resetAt, updatedAt)
     VALUES (?, 1, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(bucketKey) DO UPDATE SET
       count = CASE WHEN resetAt <= ? THEN 1 ELSE count + 1 END,
       resetAt = CASE WHEN resetAt <= ? THEN ? ELSE resetAt END,
       updatedAt = CURRENT_TIMESTAMP`,
  ).bind(bucketKey, nextReset, now, now, nextReset).run();

  const row = await database.prepare(
    'SELECT count, resetAt FROM RateLimitBucket WHERE bucketKey = ? LIMIT 1',
  ).bind(bucketKey).first() as { count?: number; resetAt?: number } | null;

  const count = Number(row?.count || 0);
  const resetAt = Number(row?.resetAt || nextReset);
  return {
    allowed: count <= input.limit,
    remaining: Math.max(0, input.limit - count),
    retryAfterSeconds: Math.max(1, Math.ceil((resetAt - now) / 1000)),
  };
}

export async function ensureUserSecurityState(userId: string, verified = false) {
  const database = db();
  await database.prepare(
    `INSERT INTO UserSecurityState (userId, emailVerifiedAt, createdAt, updatedAt)
     VALUES (?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
     ON CONFLICT(userId) DO UPDATE SET
       emailVerifiedAt = CASE
         WHEN emailVerifiedAt IS NOT NULL THEN emailVerifiedAt
         WHEN excluded.emailVerifiedAt IS NOT NULL THEN excluded.emailVerifiedAt
         ELSE NULL
       END,
       updatedAt = CURRENT_TIMESTAMP`,
  ).bind(userId, verified ? Date.now() : null).run();
}

export async function isUserEmailVerified(userId: string) {
  const row = await db().prepare(
    'SELECT emailVerifiedAt FROM UserSecurityState WHERE userId = ? LIMIT 1',
  ).bind(userId).first() as { emailVerifiedAt?: number | null } | null;

  // Legacy/invited accounts created before verification enforcement stay usable.
  return !row || Number(row.emailVerifiedAt || 0) > 0;
}

export async function markUserEmailVerified(userId: string) {
  await ensureUserSecurityState(userId, true);
}

export async function createSecurityToken(userId: string, purpose: string, ttlSeconds: number) {
  const database = db();
  const raw = randomBytes(32).toString('base64url');
  const tokenHash = digest(raw);
  const now = Date.now();
  const expiresAt = now + ttlSeconds * 1000;

  await database.prepare(
    `UPDATE SecurityToken
     SET usedAt = COALESCE(usedAt, ?)
     WHERE userId = ? AND purpose = ? AND usedAt IS NULL`,
  ).bind(now, userId, purpose).run();

  await database.prepare(
    `INSERT INTO SecurityToken
     (id, userId, purpose, tokenHash, expiresAt, usedAt, createdAt)
     VALUES (?, ?, ?, ?, ?, NULL, CURRENT_TIMESTAMP)`,
  ).bind(randomUUID(), userId, purpose, tokenHash, expiresAt).run();

  return raw;
}

export async function consumeSecurityToken(raw: string, purpose: string) {
  const database = db();
  const tokenHash = digest(raw);
  const now = Date.now();
  const row = await database.prepare(
    `SELECT id, userId
     FROM SecurityToken
     WHERE tokenHash = ? AND purpose = ? AND usedAt IS NULL AND expiresAt > ?
     LIMIT 1`,
  ).bind(tokenHash, purpose, now).first() as { id?: string; userId?: string } | null;

  if (!row?.id || !row.userId) return null;

  const result = await database.prepare(
    'UPDATE SecurityToken SET usedAt = ? WHERE id = ? AND usedAt IS NULL',
  ).bind(now, row.id).run();

  if (!result?.success) return null;
  return row.userId;
}