import { createHash, randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';
import { prisma } from './prisma';

const OAUTH_TTL_MS = 10 * 60 * 1000;
const SQUARE_VERSION = '2026-09-16';
const SQUARE_SCOPES = [
  'MERCHANT_PROFILE_READ',
  'ORDERS_READ',
  'ORDERS_WRITE',
  'PAYMENTS_READ',
  'PAYMENTS_WRITE',
] as const;

type SquareMode = 'sandbox' | 'production';
type SquareTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  merchant_id?: string;
  expires_at?: string;
  error?: string;
  message?: string;
};
type SquareLocation = {
  id: string;
  name?: string;
  status?: string;
  currency?: string;
  capabilities?: string[];
  merchant_id?: string;
};
type SquareConnectionRow = {
  organizationId: string;
  merchantId: string;
  locationId: string | null;
  locationName: string | null;
  status: string;
  mode: string;
  tokenExpiresAt: string | null;
  accessCiphertext: string;
  refreshCiphertext: string;
};

let tablesReady: Promise<void> | null = null;

export type SquareMerchantStatus = {
  merchantId: string;
  locationId: string | null;
  locationName: string | null;
  status: 'CONNECTED' | 'NEEDS_LOCATION';
  mode: SquareMode;
};

export function squareConfig() {
  const mode: SquareMode = process.env.SQUARE_ENVIRONMENT === 'production' ? 'production' : 'sandbox';
  const applicationId = (process.env.SQUARE_APPLICATION_ID || '').trim();
  const applicationSecret = (process.env.SQUARE_APPLICATION_SECRET || '').trim();
  const redirectUri = (process.env.SQUARE_OAUTH_REDIRECT_URI || '').trim();
  const encryptionKey = (process.env.PAYMENT_CREDENTIALS_KEY || '').trim();
  const ready = Boolean(applicationId && applicationSecret && redirectUri && encryptionKey && validEncryptionKey(encryptionKey));
  return { mode, applicationId, applicationSecret, redirectUri, encryptionKey, ready };
}

export function validEncryptionKey(value: string) {
  return /^[A-Za-z0-9+/_=-]+$/.test(value) && Buffer.from(value, 'base64').length === 32;
}

function encryptionKey(value: string): Buffer {
  if (!validEncryptionKey(value)) throw new Error('PAYMENT_CREDENTIALS_KEY must be 32 random bytes encoded as base64.');
  return Buffer.from(value, 'base64');
}

export function encryptSquareCredential(value: string, key: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(key), iv);
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), ciphertext.toString('base64url')].join(':');
}

export function decryptSquareCredential(value: string, key: string): string {
  const parts = value.split(':');
  if (parts.length !== 4 || parts[0] !== 'v1') throw new Error('Invalid encrypted payment credential.');
  const iv = Buffer.from(parts[1], 'base64url');
  const tag = Buffer.from(parts[2], 'base64url');
  if (iv.length !== 12 || tag.length !== 16) throw new Error('Invalid payment credential authentication data.');
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(key), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(Buffer.from(parts[3], 'base64url')), decipher.final()]).toString('utf8');
}

function baseUrl(mode: SquareMode) {
  return mode === 'production' ? 'https://connect.squareup.com' : 'https://connect.squareupsandbox.com';
}

export function buildSquareAuthorizationUrl(input: {
  mode: SquareMode;
  applicationId: string;
  redirectUri: string;
  state: string;
}): string {
  const uri = new URL('/oauth2/authorize', baseUrl(input.mode));
  uri.searchParams.set('client_id', input.applicationId);
  uri.searchParams.set('response_type', 'code');
  uri.searchParams.set('scope', SQUARE_SCOPES.join(' '));
  uri.searchParams.set('state', input.state);
  uri.searchParams.set('session', 'false');
  // Registered with Square for this application (not user-supplied).
  uri.searchParams.set('redirect_uri', input.redirectUri);
  return uri.toString();
}

export function squareOauthConfigured() {
  return squareConfig().ready;
}

async function ensureSquareTables() {
  if (!tablesReady) {
    tablesReady = (async () => {
      await prisma.$executeRawUnsafe(
        'CREATE TABLE IF NOT EXISTS SquareOAuthState (' +
        'stateHash TEXT PRIMARY KEY NOT NULL, organizationId TEXT NOT NULL, ' +
        'userId TEXT NOT NULL, environment TEXT NOT NULL, expiresAtMs INTEGER NOT NULL, ' +
        'consumedAtMs INTEGER, createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)'
      );
      await prisma.$executeRawUnsafe(
        'CREATE TABLE IF NOT EXISTS SquareMerchantConnection (' +
        'organizationId TEXT PRIMARY KEY NOT NULL, merchantId TEXT NOT NULL, ' +
        'locationId TEXT, locationName TEXT, status TEXT NOT NULL, mode TEXT NOT NULL, ' +
        'tokenExpiresAt TEXT, accessCiphertext TEXT NOT NULL, refreshCiphertext TEXT NOT NULL, ' +
        'updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)'
      );
    })().catch((error) => {
      tablesReady = null;
      throw error;
    });
  }
  return tablesReady;
}

function requireSquareConfig() {
  const cfg = squareConfig();
  if (!cfg.ready) throw new Error('Square business connection is not configured.');
  const uri = new URL(cfg.redirectUri);
  if (uri.protocol !== 'https:' && !(process.env.NODE_ENV !== 'production' && uri.hostname === 'localhost')) {
    throw new Error('Square redirect must be HTTPS.');
  }
  if (uri.username || uri.password || uri.hash) throw new Error('Invalid Square redirect URI.');
  return cfg;
}

export async function beginSquareOnboarding(organizationId: string, userId: string) {
  const cfg = requireSquareConfig();
  await ensureSquareTables();
  await prisma.$executeRawUnsafe('DELETE FROM SquareOAuthState WHERE expiresAtMs <= ?', Date.now());
  const state = randomBytes(32).toString('base64url');
  const stateHash = createHash('sha256').update(state).digest('hex');
  await prisma.$executeRawUnsafe(
    'INSERT INTO SquareOAuthState (stateHash, organizationId, userId, environment, expiresAtMs) VALUES (?, ?, ?, ?, ?)',
    stateHash, organizationId, userId, cfg.mode, Date.now() + OAUTH_TTL_MS
  );
  return buildSquareAuthorizationUrl({
    mode: cfg.mode, applicationId: cfg.applicationId, redirectUri: cfg.redirectUri, state,
  });
}

async function squareTokenRequest(body: Record<string, string>, cfg: ReturnType<typeof squareConfig>) {
  const response = await fetch(baseUrl(cfg.mode) + '/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Square-Version': SQUARE_VERSION },
    body: JSON.stringify({ client_id: cfg.applicationId, client_secret: cfg.applicationSecret, ...body }),
    cache: 'no-store',
  });
  const data = await response.json() as SquareTokenResponse;
  if (!response.ok || !data.access_token) throw new Error('Square authorization failed. Please reconnect.');
  return data;
}

async function activeSquareLocation(accessToken: string, mode: SquareMode, merchantId: string) {
  const response = await fetch(baseUrl(mode) + '/v2/locations', {
    headers: {
      Authorization: 'Bearer ' + accessToken,
      'Square-Version': SQUARE_VERSION,
    },
    cache: 'no-store',
  });
  if (!response.ok) throw new Error('Square authorization succeeded, but we could not verify its business locations.');
  const data = await response.json() as { locations?: SquareLocation[] };
  return (data.locations || []).filter((item) =>
    item.status === 'ACTIVE' &&
    item.currency === 'USD' &&
    item.capabilities?.includes('CREDIT_CARD_PROCESSING') &&
    (!item.merchant_id || item.merchant_id === merchantId)
  );
}

export async function finishSquareOnboarding(input: {
  organizationId: string;
  userId: string;
  state: string;
  code: string;
}): Promise<SquareMerchantStatus> {
  const cfg = requireSquareConfig();
  await ensureSquareTables();
  if (!/^[A-Za-z0-9_-]{20,200}$/.test(input.state) || !input.code || input.code.length > 250) {
    throw new Error('Invalid Square authorization callback.');
  }
  const stateHash = createHash('sha256').update(input.state).digest('hex');
  // UPDATE RETURNING claims a one-time state atomically; a second callback cannot reuse it.
  const state = await prisma.$queryRawUnsafe<Array<{ organizationId: string }>>(
    'UPDATE SquareOAuthState SET consumedAtMs = ? ' +
    'WHERE stateHash = ? AND organizationId = ? AND userId = ? AND environment = ? ' +
    'AND consumedAtMs IS NULL AND expiresAtMs > ? RETURNING organizationId',
    Date.now(), stateHash, input.organizationId, input.userId, cfg.mode, Date.now()
  );
  if (state.length !== 1) throw new Error('Square authorization expired or was already used. Start again.');

  const token = await squareTokenRequest({
    grant_type: 'authorization_code',
    code: input.code,
    redirect_uri: cfg.redirectUri,
  }, cfg);
  if (!token.merchant_id || !token.refresh_token) {
    throw new Error('Square did not provide a complete merchant authorization.');
  }
  const locations = await activeSquareLocation(token.access_token!, cfg.mode, token.merchant_id);
  const location = locations.length === 1 ? locations[0] : null;
  const status: 'CONNECTED' | 'NEEDS_LOCATION' = location ? 'CONNECTED' : 'NEEDS_LOCATION';

  await prisma.$executeRawUnsafe(
    'INSERT INTO SquareMerchantConnection ' +
    '(organizationId, merchantId, locationId, locationName, status, mode, tokenExpiresAt, accessCiphertext, refreshCiphertext) ' +
    'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ' +
    'ON CONFLICT(organizationId) DO UPDATE SET ' +
    'merchantId=excluded.merchantId, locationId=excluded.locationId, locationName=excluded.locationName, ' +
    'status=excluded.status, mode=excluded.mode, tokenExpiresAt=excluded.tokenExpiresAt, ' +
    'accessCiphertext=excluded.accessCiphertext, refreshCiphertext=excluded.refreshCiphertext, updatedAt=CURRENT_TIMESTAMP',
    input.organizationId, token.merchant_id, location?.id || null, location?.name || null,
    status, cfg.mode, token.expires_at || null,
    encryptSquareCredential(token.access_token!, cfg.encryptionKey),
    encryptSquareCredential(token.refresh_token, cfg.encryptionKey)
  );

  return {
    merchantId: token.merchant_id,
    locationId: location?.id || null,
    locationName: location?.name || null,
    status, mode: cfg.mode,
  };
}


async function readSquareCredentials(organizationId: string) {
  const cfg = requireSquareConfig();
  await ensureSquareTables();
  const rows = await prisma.$queryRawUnsafe<SquareConnectionRow[]>(
    'SELECT * FROM SquareMerchantConnection WHERE organizationId = ? LIMIT 1', organizationId
  );
  const connection = rows[0];
  if (!connection || connection.mode !== cfg.mode) throw new Error('Square merchant account is not connected in this environment.');
  let token = decryptSquareCredential(connection.accessCiphertext, cfg.encryptionKey);
  const expiresAt = connection.tokenExpiresAt ? Date.parse(connection.tokenExpiresAt) : NaN;
  if (Number.isFinite(expiresAt) && expiresAt < Date.now() + 120000) {
    const refreshed = await squareTokenRequest({
      grant_type: 'refresh_token',
      refresh_token: decryptSquareCredential(connection.refreshCiphertext, cfg.encryptionKey),
    }, cfg);
    if (refreshed.merchant_id && refreshed.merchant_id !== connection.merchantId) {
      throw new Error('Square refreshed credentials do not match the connected merchant.');
    }
    const refreshedToken = encryptSquareCredential(refreshed.access_token!, cfg.encryptionKey);
    const refreshedRefresh = refreshed.refresh_token
      ? encryptSquareCredential(refreshed.refresh_token, cfg.encryptionKey)
      : connection.refreshCiphertext;
    await prisma.$executeRawUnsafe(
      'UPDATE SquareMerchantConnection SET accessCiphertext = ?, refreshCiphertext = ?, ' +
      'tokenExpiresAt = ?, updatedAt = CURRENT_TIMESTAMP WHERE organizationId = ? AND merchantId = ? AND mode = ?',
      refreshedToken, refreshedRefresh, refreshed.expires_at || null,
      organizationId, connection.merchantId, cfg.mode
    );
    token = refreshed.access_token!;
  }
  return { token, cfg, merchantId: connection.merchantId };
}

/** Never returns OAuth credentials to a client. */
export async function listSquareMerchantLocations(organizationId: string) {
  const { token, cfg, merchantId } = await readSquareCredentials(organizationId);
  const locations = await activeSquareLocation(token, cfg.mode, merchantId);
  return locations.map((location) => ({ id: location.id, name: location.name || 'Square location' }));
}

export async function selectSquareMerchantLocation(organizationId: string, locationId: string) {
  if (!locationId || locationId.length > 100) throw new Error('Choose a valid Square location.');
  const locations = await listSquareMerchantLocations(organizationId);
  const chosen = locations.find((location) => location.id === locationId);
  if (!chosen) throw new Error('Square location not found in the connected merchant account.');
  const cfg = requireSquareConfig();
  const changed = await prisma.$executeRawUnsafe(
    'UPDATE SquareMerchantConnection SET locationId = ?, locationName = ?, status = ?, updatedAt = CURRENT_TIMESTAMP ' +
    'WHERE organizationId = ? AND mode = ?',
    chosen.id, chosen.name, 'CONNECTED', organizationId, cfg.mode
  );
  if (changed !== 1) throw new Error('Square connection changed. Reconnect your account.');
  return chosen;
}

export async function getSquareMerchantStatus(organizationId: string): Promise<SquareMerchantStatus | null> {
  await ensureSquareTables();
  const rows = await prisma.$queryRawUnsafe<Array<Omit<SquareConnectionRow, 'accessCiphertext' | 'refreshCiphertext'>>>(
    'SELECT organizationId, merchantId, locationId, locationName, status, mode, tokenExpiresAt ' +
    'FROM SquareMerchantConnection WHERE organizationId = ? LIMIT 1',
    organizationId
  );
  const row = rows[0];
  if (!row) return null;
  return {
    merchantId: row.merchantId,
    locationId: row.locationId,
    locationName: row.locationName,
    status: row.status === 'CONNECTED' ? 'CONNECTED' : 'NEEDS_LOCATION',
    mode: row.mode === 'production' ? 'production' : 'sandbox',
  };
}

/**
 * Makes merchant-scoped Square requests with server-only, refreshed OAuth credentials.
 * Tokens are never sent to browsers and cannot be supplied by a caller.
 */
export async function squareMerchantApi<T>(
  organizationId: string,
  path: string,
  init: { method?: 'GET' | 'POST'; body?: Record<string, unknown> } = {},
): Promise<T> {
  if (!/^\/v2\/(?:online-checkout\/payment-links|orders|payments|refunds)(?:[/?][A-Za-z0-9_/?&=%.-]+)?$/.test(path)) {
    throw new Error('Unsupported Square API route.');
  }
  const connection = await getSquareMerchantStatus(organizationId);
  const cfg = requireSquareConfig();
  if (!connection || connection.mode !== cfg.mode || connection.status !== 'CONNECTED' || !connection.locationId) {
    throw new Error('SQUARE_ORGANIZATION_NOT_READY');
  }
  const { token } = await readSquareCredentials(organizationId);
  const response = await fetch(baseUrl(cfg.mode) + path, {
    method: init.method || 'GET',
    headers: {
      Authorization: 'Bearer ' + token,
      'Square-Version': SQUARE_VERSION,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(init.body ? { body: JSON.stringify(init.body) } : {}),
    cache: 'no-store',
  });
  const data = await response.json() as T & { errors?: Array<{ code?: string; detail?: string }> };
  if (!response.ok) throw new Error('SQUARE_PROVIDER_REQUEST_FAILED');
  return data;
}

export function squareCheckoutEnabled() {
  // Three independent gates prevent accidentally enabling customer charges
  // while merchant auth, notifications or production approval are incomplete.
  const cfg = squareConfig();
  const webhookKey = (process.env.SQUARE_WEBHOOK_SIGNATURE_KEY || '').trim();
  const webhookUrl = (process.env.SQUARE_WEBHOOK_NOTIFICATION_URL || '').trim();
  let validWebhookUrl = false;
  try {
    const url = new URL(webhookUrl);
    validWebhookUrl = url.protocol === 'https:' && !url.username && !url.password && !url.hash;
  } catch {}
  return process.env.SQUARE_CUSTOMER_CHECKOUT_ENABLED === 'true' &&
    cfg.ready && Boolean(webhookKey) && validWebhookUrl &&
    (cfg.mode !== 'production' || process.env.SQUARE_PRODUCTION_CHECKOUT_APPROVED === 'true') &&
    (cfg.mode !== 'sandbox' || process.env.NODE_ENV !== 'production');
}
