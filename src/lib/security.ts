import { createHash, randomBytes, randomUUID } from 'crypto';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { emailDeliveryConfigured } from './email-delivery';
import { sessionIssuedAfterInvalidation } from './security-policy';

type RateLimitInput = {
  scope: string;
  identity?: string;
  limit: number;
  windowSeconds: number;
  includeIp?: boolean;
};

type SessionScope = 'user' | 'platform';

function db() {
  const { env } = getCloudflareContext();
  const database = (env as any).DB;
  if (!database) throw new Error('ICA application database is not available.');
  return database;
}

let securityTablesReady: Promise<void> | null = null;

async function ensureSecurityTables() {
  if (!securityTablesReady) {
    securityTablesReady = (async () => {
      const database = db();
      await database.prepare(`
        CREATE TABLE IF NOT EXISTS UserSecurityState (
          userId TEXT PRIMARY KEY NOT NULL,
          emailVerifiedAt INTEGER,
          createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `).run();
      await database.prepare(`
        CREATE TABLE IF NOT EXISTS SecurityToken (
          id TEXT PRIMARY KEY NOT NULL,
          userId TEXT NOT NULL,
          purpose TEXT NOT NULL,
          tokenHash TEXT NOT NULL UNIQUE,
          expiresAt INTEGER NOT NULL,
          usedAt INTEGER,
          createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `).run();
      await database.prepare(`
        CREATE INDEX IF NOT EXISTS SecurityToken_user_purpose
        ON SecurityToken (userId, purpose, expiresAt)
      `).run();
      await database.prepare(`
        CREATE TABLE IF NOT EXISTS RateLimitBucket (
          bucketKey TEXT PRIMARY KEY NOT NULL,
          count INTEGER NOT NULL DEFAULT 0,
          resetAt INTEGER NOT NULL,
          updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `).run();
      await database.prepare(`
        CREATE TABLE IF NOT EXISTS PrincipalSessionState (
          scope TEXT NOT NULL,
          principalId TEXT NOT NULL,
          invalidAfter INTEGER NOT NULL DEFAULT 0,
          updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (scope, principalId)
        )
      `).run();
      await database.prepare(`
        CREATE TABLE IF NOT EXISTS RevokedSession (
          sessionId TEXT PRIMARY KEY NOT NULL,
          scope TEXT NOT NULL,
          principalId TEXT NOT NULL,
          expiresAt INTEGER NOT NULL,
          revokedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `).run();
      await database.prepare(`
        CREATE INDEX IF NOT EXISTS RevokedSession_expiry
        ON RevokedSession (expiresAt)
      `).run();
    })().catch((error) => {
      securityTablesReady = null;
      throw error;
    });
  }
  return securityTablesReady;
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
  await ensureSecurityTables();
  const now = Date.now();
  const nextReset = now + input.windowSeconds * 1000;
  const networkIdentity = input.includeIp === false ? 'global' : ipFor(request);
  const bucketKey = digest(
    `${input.scope}|${networkIdentity}|${String(input.identity || '').trim().toLowerCase()}`,
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

export async function revokeSession(input: {
  sessionId: string;
  scope: SessionScope;
  principalId: string;
  expiresAtSeconds: number;
}) {
  if (!input.sessionId || !input.principalId) return;
  await ensureSecurityTables();
  const database = db();
  const expiresAt = Math.max(Date.now(), Number(input.expiresAtSeconds || 0) * 1000);

  await database.prepare(
    `INSERT INTO RevokedSession (sessionId, scope, principalId, expiresAt, revokedAt)
     VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(sessionId) DO UPDATE SET
       scope = excluded.scope,
       principalId = excluded.principalId,
       expiresAt = excluded.expiresAt,
       revokedAt = CURRENT_TIMESTAMP`,
  ).bind(input.sessionId, input.scope, input.principalId, expiresAt).run();

  await database.prepare(
    'DELETE FROM RevokedSession WHERE expiresAt <= ?',
  ).bind(Date.now()).run();
}

export async function invalidatePrincipalSessions(scope: SessionScope, principalId: string) {
  if (!principalId) return;
  await ensureSecurityTables();
  const invalidAfter = Date.now();
  await db().prepare(
    `INSERT INTO PrincipalSessionState (scope, principalId, invalidAfter, updatedAt)
     VALUES (?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(scope, principalId) DO UPDATE SET
       invalidAfter = excluded.invalidAfter,
       updatedAt = CURRENT_TIMESTAMP`,
  ).bind(scope, principalId, invalidAfter).run();
}

export async function sessionIsValid(input: {
  sessionId: string;
  scope: SessionScope;
  principalId: string;
  issuedAtMs: number;
}) {
  await ensureSecurityTables();
  const database = db();
  const now = Date.now();

  const revoked = await database.prepare(
    `SELECT sessionId
     FROM RevokedSession
     WHERE sessionId = ? AND scope = ? AND principalId = ? AND expiresAt > ?
     LIMIT 1`,
  ).bind(input.sessionId, input.scope, input.principalId, now).first();

  if (revoked) return false;

  const state = await database.prepare(
    `SELECT invalidAfter
     FROM PrincipalSessionState
     WHERE scope = ? AND principalId = ?
     LIMIT 1`,
  ).bind(input.scope, input.principalId).first() as { invalidAfter?: number | null } | null;

  return sessionIssuedAfterInvalidation(input.issuedAtMs, Number(state?.invalidAfter || 0));
}

export async function ensureUserSecurityState(userId: string, verified = false) {
  await ensureSecurityTables();
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
  await ensureSecurityTables();
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
  await ensureSecurityTables();
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
  await ensureSecurityTables();
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
