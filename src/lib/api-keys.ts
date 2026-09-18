import { createHash, randomBytes, randomUUID } from 'crypto';
import { prisma } from './prisma';
import { consumeRateLimit } from './security';
import { apiKeyExpired, apiScopeAllowed } from './security-policy';

const DEFAULT_SCOPES = ['members:read', 'members:write'];
const DEFAULT_EXPIRY_DAYS = 90;
const DEFAULT_REQUESTS_PER_MINUTE = 120;

let apiTablesReady: Promise<void> | null = null;

async function ensureApiKeyTables() {
  if (!apiTablesReady) {
    apiTablesReady = (async () => {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS ApiCredential (
          id TEXT PRIMARY KEY NOT NULL,
          organizationId TEXT NOT NULL,
          name TEXT NOT NULL,
          keyPrefix TEXT NOT NULL,
          keyHash TEXT NOT NULL UNIQUE,
          active INTEGER NOT NULL DEFAULT 1,
          createdById TEXT,
          createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          lastUsedAt TEXT
        )
      `);
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS ApiCredentialPolicy (
          credentialId TEXT PRIMARY KEY NOT NULL,
          scopesJson TEXT NOT NULL,
          expiresAt INTEGER NOT NULL,
          requestsPerMinute INTEGER NOT NULL DEFAULT 120,
          updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `);
      await prisma.$executeRawUnsafe(
        'CREATE INDEX IF NOT EXISTS ApiCredential_org_active ON ApiCredential (organizationId, active)',
      );
      await prisma.$executeRawUnsafe(
        'CREATE INDEX IF NOT EXISTS ApiCredentialPolicy_expiry ON ApiCredentialPolicy (expiresAt)',
      );

      const legacyExpiry = Date.now() + DEFAULT_EXPIRY_DAYS * 24 * 60 * 60 * 1000;
      await prisma.$executeRawUnsafe(
        `INSERT OR IGNORE INTO ApiCredentialPolicy
          (credentialId, scopesJson, expiresAt, requestsPerMinute, updatedAt)
         SELECT id, ?, ?, ?, CURRENT_TIMESTAMP
         FROM ApiCredential`,
        JSON.stringify(DEFAULT_SCOPES),
        legacyExpiry,
        DEFAULT_REQUESTS_PER_MINUTE,
      );
    })().catch((error) => {
      apiTablesReady = null;
      throw error;
    });
  }
  return apiTablesReady;
}

function digest(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

function safeScopes(value: string) {
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [...DEFAULT_SCOPES];
    return parsed.filter((scope): scope is string => typeof scope === 'string');
  } catch {
    return [...DEFAULT_SCOPES];
  }
}

export async function createApiKey(input: {
  organizationId: string;
  createdById: string;
  name: string;
  scopes?: string[];
  expiresInDays?: number;
  requestsPerMinute?: number;
}) {
  await ensureApiKeyTables();

  const scopes = input.scopes?.length ? [...new Set(input.scopes)] : [...DEFAULT_SCOPES];
  const expiresInDays = Math.min(365, Math.max(1, Number(input.expiresInDays || DEFAULT_EXPIRY_DAYS)));
  const requestsPerMinute = Math.min(1000, Math.max(10, Number(input.requestsPerMinute || DEFAULT_REQUESTS_PER_MINUTE)));
  const raw = 'ica_live_' + randomBytes(28).toString('base64url');
  const keyHash = digest(raw);
  const keyPrefix = raw.slice(0, 16);
  const id = randomUUID();
  const expiresAt = Date.now() + expiresInDays * 24 * 60 * 60 * 1000;

  await prisma.$executeRawUnsafe(
    `INSERT INTO ApiCredential
      (id, organizationId, name, keyPrefix, keyHash, active, createdById, createdAt)
     VALUES (?, ?, ?, ?, ?, 1, ?, CURRENT_TIMESTAMP)`,
    id,
    input.organizationId,
    input.name,
    keyPrefix,
    keyHash,
    input.createdById,
  );

  await prisma.$executeRawUnsafe(
    `INSERT INTO ApiCredentialPolicy
      (credentialId, scopesJson, expiresAt, requestsPerMinute, updatedAt)
     VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`,
    id,
    JSON.stringify(scopes),
    expiresAt,
    requestsPerMinute,
  );

  return { id, raw, keyPrefix, name: input.name, scopes, expiresAt, requestsPerMinute };
}

export async function listApiKeys(organizationId: string) {
  await ensureApiKeyTables();
  const rows = await prisma.$queryRawUnsafe<Array<{
    id: string;
    name: string;
    keyPrefix: string;
    active: number;
    createdAt: string;
    lastUsedAt: string | null;
    scopesJson: string;
    expiresAt: number;
    requestsPerMinute: number;
  }>>(
    `SELECT
       c.id,
       c.name,
       c.keyPrefix,
       c.active,
       c.createdAt,
       c.lastUsedAt,
       p.scopesJson,
       p.expiresAt,
       p.requestsPerMinute
     FROM ApiCredential c
     JOIN ApiCredentialPolicy p ON p.credentialId = c.id
     WHERE c.organizationId = ?
     ORDER BY c.createdAt DESC`,
    organizationId,
  );

  return rows.map((row) => ({
    ...row,
    scopes: safeScopes(row.scopesJson),
    expired: apiKeyExpired(row.expiresAt),
  }));
}

export async function revokeApiKey(organizationId: string, id: string) {
  await ensureApiKeyTables();
  await prisma.$executeRawUnsafe(
    'UPDATE ApiCredential SET active = 0 WHERE id = ? AND organizationId = ?',
    id,
    organizationId,
  );
}

export type ApiKeyAuthResult =
  | {
      ok: true;
      credentialId: string;
      organizationId: string;
      name: string;
      scopes: string[];
      remaining: number;
    }
  | {
      ok: false;
      status: 401 | 403 | 429;
      error: string;
      retryAfterSeconds?: number;
    };

export async function authenticateApiRequest(
  request: Request,
  requiredScope: string,
): Promise<ApiKeyAuthResult> {
  await ensureApiKeyTables();

  const authorization = request.headers.get('authorization') || '';
  if (!authorization.startsWith('Bearer ')) {
    return { ok: false, status: 401, error: 'A valid ICA API bearer key is required.' };
  }

  const rawKey = authorization.slice('Bearer '.length).trim();
  if (!rawKey) {
    return { ok: false, status: 401, error: 'A valid ICA API bearer key is required.' };
  }

  const keyHash = digest(rawKey);
  const rows = await prisma.$queryRawUnsafe<Array<{
    id: string;
    organizationId: string;
    name: string;
    active: number;
    scopesJson: string;
    expiresAt: number;
    requestsPerMinute: number;
  }>>(
    `SELECT
       c.id,
       c.organizationId,
       c.name,
       c.active,
       p.scopesJson,
       p.expiresAt,
       p.requestsPerMinute
     FROM ApiCredential c
     JOIN ApiCredentialPolicy p ON p.credentialId = c.id
     WHERE c.keyHash = ? AND c.active = 1
     LIMIT 1`,
    keyHash,
  );

  const match = rows[0];
  if (!match || apiKeyExpired(match.expiresAt)) {
    return { ok: false, status: 401, error: 'This ICA API key is invalid or expired.' };
  }

  const scopes = safeScopes(match.scopesJson);
  if (!apiScopeAllowed(scopes, requiredScope)) {
    return { ok: false, status: 403, error: 'This ICA API key does not have the required scope.' };
  }

  const limit = await consumeRateLimit(request, {
    scope: 'api-key',
    identity: match.id,
    limit: Math.max(10, Number(match.requestsPerMinute || DEFAULT_REQUESTS_PER_MINUTE)),
    windowSeconds: 60,
    includeIp: false,
  });
  if (!limit.allowed) {
    return {
      ok: false,
      status: 429,
      error: 'This ICA API key exceeded its request limit.',
      retryAfterSeconds: limit.retryAfterSeconds,
    };
  }

  await prisma.$executeRawUnsafe(
    'UPDATE ApiCredential SET lastUsedAt = CURRENT_TIMESTAMP WHERE id = ?',
    match.id,
  );

  return {
    ok: true,
    credentialId: match.id,
    organizationId: match.organizationId,
    name: match.name,
    scopes,
    remaining: limit.remaining,
  };
}
