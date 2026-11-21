import { createHash, randomBytes } from 'node:crypto';
import { prisma } from './prisma';
import { encryptSquareCredential, decryptSquareCredential, validEncryptionKey } from './square-connect';

export type AuthorizeNetEnvironment = 'sandbox' | 'production';
type TokenResponse = {
  access_token?: string; refresh_token?: string; expires_in?: number; token_type?: string;
};
type MerchantRow = {
  merchantId: string; accessCiphertext: string; refreshCiphertext: string;
  expiresAtMs: number; environment: string; status: string;
};
let tablesReady: Promise<void> | null = null;

export function authorizeNetPartnerConfig() {
  const environment: AuthorizeNetEnvironment = process.env.AUTHNET_ENVIRONMENT === 'production'
    ? 'production' : 'sandbox';
  const clientId = String(process.env.AUTHNET_PARTNER_CLIENT_ID || '').trim();
  const clientSecret = String(process.env.AUTHNET_PARTNER_CLIENT_SECRET || '').trim();
  const callbackUrl = String(process.env.AUTHNET_OAUTH_CALLBACK_URL || '').trim();
  const credentialKey = String(process.env.PAYMENT_CREDENTIALS_KEY || '').trim();
  let validCallback = false;
  try {
    const url = new URL(callbackUrl);
    validCallback = url.protocol === 'https:' && !url.username && !url.password && !url.hash;
  } catch {}
  return {
    environment, clientId, clientSecret, callbackUrl, credentialKey,
    ready: Boolean(clientId && clientSecret && validCallback && validEncryptionKey(credentialKey) &&
      process.env.AUTHNET_PARTNER_OAUTH_APPROVED === 'true'),
  };
}

export function buildAuthorizeNetConsentUrl(input: {
  environment: AuthorizeNetEnvironment; clientId: string; callbackUrl: string; state: string;
}) {
  const host = input.environment === 'production' ? 'account.authorize.net' : 'sandbox.authorize.net';
  const url = new URL('https://' + host + '/oauth/authorize');
  url.searchParams.set('sub', 'oauth');
  url.searchParams.set('client_id', input.clientId);
  url.searchParams.set('redirect_uri', input.callbackUrl);
  url.searchParams.set('scope', 'read,write');
  url.searchParams.set('state', input.state);
  return url.toString();
}

function tokenUrl(environment: AuthorizeNetEnvironment) {
  return environment === 'production'
    ? 'https://access.authorize.net/oauth/v1/token'
    : 'https://accesstest.authorize.net/oauth/v1/token';
}

async function oauthTokenRequest(
  cfg: ReturnType<typeof authorizeNetPartnerConfig>,
  input: Record<string, string>,
) {
  if (!cfg.ready) throw new Error('AUTHNET_PARTNER_NOT_CONFIGURED');
  const body = new URLSearchParams({
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    platform: '2',
    ...input,
  });
  const response = await fetch(tokenUrl(cfg.environment), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body, cache: 'no-store',
  });
  if (!response.ok) throw new Error('AUTHNET_OAUTH_EXCHANGE_FAILED');
  const token = await response.json() as TokenResponse;
  if (!token.access_token || !token.refresh_token || !Number.isFinite(token.expires_in)) {
    throw new Error('AUTHNET_OAUTH_RESPONSE_INCOMPLETE');
  }
  return token;
}

/**
 * The JWT is obtained directly from the provider token endpoint over HTTPS,
 * not from an untrusted browser. We still verify it by making an authenticated
 * merchant API call before recording the merchant as connected.
 */
export function merchantIdFromAuthorizeNetToken(token: string) {
  const parts = token.split('.');
  if (parts.length !== 3 || !parts[1]) throw new Error('AUTHNET_MERCHANT_TOKEN_INVALID');
  const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as {
    merchant_id?: string | number;
  };
  const merchant = String(payload.merchant_id || '');
  if (!/^[A-Za-z0-9_-]{2,60}$/.test(merchant)) throw new Error('AUTHNET_MERCHANT_TOKEN_INVALID');
  return merchant;
}

async function ensureAuthorizeNetTables() {
  if (!tablesReady) {
    tablesReady = (async () => {
      await prisma.$executeRawUnsafe(
        'CREATE TABLE IF NOT EXISTS AuthorizeNetOAuthState (' +
        'stateHash TEXT PRIMARY KEY NOT NULL, organizationId TEXT NOT NULL, userId TEXT NOT NULL, ' +
        'environment TEXT NOT NULL, expiresAtMs INTEGER NOT NULL, consumedAtMs INTEGER)'
      );
      await prisma.$executeRawUnsafe(
        'CREATE TABLE IF NOT EXISTS AuthorizeNetMerchantConnection (' +
        'organizationId TEXT PRIMARY KEY NOT NULL, merchantId TEXT NOT NULL, ' +
        'accessCiphertext TEXT NOT NULL, refreshCiphertext TEXT NOT NULL, expiresAtMs INTEGER NOT NULL, ' +
        'environment TEXT NOT NULL, status TEXT NOT NULL, updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)'
      );
    })().catch((error) => { tablesReady = null; throw error; });
  }
  return tablesReady;
}

export async function beginAuthorizeNetMerchantOnboarding(organizationId: string, userId: string) {
  const cfg = authorizeNetPartnerConfig();
  if (!cfg.ready) throw new Error('AUTHNET_PARTNER_NOT_CONFIGURED');
  await ensureAuthorizeNetTables();
  await prisma.$executeRawUnsafe('DELETE FROM AuthorizeNetOAuthState WHERE expiresAtMs <= ?', Date.now());
  const state = randomBytes(32).toString('base64url');
  const stateHash = createHash('sha256').update(state).digest('hex');
  await prisma.$executeRawUnsafe(
    'INSERT INTO AuthorizeNetOAuthState (stateHash, organizationId, userId, environment, expiresAtMs) ' +
    'VALUES (?, ?, ?, ?, ?)',
    stateHash, organizationId, userId, cfg.environment, Date.now() + 10 * 60_000,
  );
  return buildAuthorizeNetConsentUrl({
    environment: cfg.environment, clientId: cfg.clientId, callbackUrl: cfg.callbackUrl, state,
  });
}

async function authorizeNetMerchantRequest<T>(
  accessToken: string, environment: AuthorizeNetEnvironment, operation: Record<string, unknown>,
) {
  const url = environment === 'production'
    ? 'https://api.authorize.net/xml/v1/request.api'
    : 'https://apitest.authorize.net/xml/v1/request.api';
  const response = await fetch(url, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(operation), cache: 'no-store',
  });
  if (!response.ok) throw new Error('AUTHNET_MERCHANT_API_UNAVAILABLE');
  const result = await response.json() as T & {
    messages?: { resultCode?: string };
  };
  if (result.messages?.resultCode !== 'Ok') throw new Error('AUTHNET_MERCHANT_API_NOT_AUTHORIZED');
  return result;
}

export async function finishAuthorizeNetMerchantOnboarding(input: {
  organizationId: string; userId: string; state: string; code: string;
}) {
  const cfg = authorizeNetPartnerConfig();
  if (!cfg.ready) throw new Error('AUTHNET_PARTNER_NOT_CONFIGURED');
  if (!/^[A-Za-z0-9_-]{20,200}$/.test(input.state) || !input.code || input.code.length > 1000) {
    throw new Error('AUTHNET_OAUTH_CALLBACK_INVALID');
  }
  await ensureAuthorizeNetTables();
  const stateHash = createHash('sha256').update(input.state).digest('hex');
  const claimed = await prisma.$queryRawUnsafe<Array<{ stateHash: string }>>(
    'UPDATE AuthorizeNetOAuthState SET consumedAtMs = ? ' +
    'WHERE stateHash = ? AND organizationId = ? AND userId = ? AND environment = ? ' +
    'AND expiresAtMs > ? AND consumedAtMs IS NULL RETURNING stateHash',
    Date.now(), stateHash, input.organizationId, input.userId, cfg.environment, Date.now(),
  );
  if (claimed.length !== 1) throw new Error('AUTHNET_OAUTH_EXPIRED');
  const token = await oauthTokenRequest(cfg, {
    grant_type: 'authorization_code', code: input.code,
  });
  const merchantId = merchantIdFromAuthorizeNetToken(token.access_token!);
  await authorizeNetMerchantRequest(token.access_token!, cfg.environment, {
    authenticateTestRequest: { merchantAuthentication: { accessToken: token.access_token } },
  });
  await prisma.$executeRawUnsafe(
    'INSERT INTO AuthorizeNetMerchantConnection ' +
    '(organizationId, merchantId, accessCiphertext, refreshCiphertext, expiresAtMs, environment, status) ' +
    'VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(organizationId) DO UPDATE SET ' +
    'merchantId=excluded.merchantId, accessCiphertext=excluded.accessCiphertext, ' +
    'refreshCiphertext=excluded.refreshCiphertext, expiresAtMs=excluded.expiresAtMs, ' +
    'environment=excluded.environment, status=excluded.status, updatedAt=CURRENT_TIMESTAMP',
    input.organizationId, merchantId,
    encryptSquareCredential(token.access_token!, cfg.credentialKey),
    encryptSquareCredential(token.refresh_token!, cfg.credentialKey),
    Date.now() + Math.max(60, Number(token.expires_in)) * 1000, cfg.environment, 'CONNECTED',
  );
  return { merchantId, status: 'CONNECTED' as const };
}

export async function getAuthorizeNetMerchantStatus(organizationId: string) {
  const cfg = authorizeNetPartnerConfig();
  if (!cfg.ready) return { connected: false, environment: cfg.environment };
  await ensureAuthorizeNetTables();
  const rows = await prisma.$queryRawUnsafe<Array<MerchantRow>>(
    'SELECT merchantId, status, environment FROM AuthorizeNetMerchantConnection ' +
    'WHERE organizationId = ? LIMIT 1', organizationId
  );
  return { connected: rows[0]?.status === 'CONNECTED' && rows[0].environment === cfg.environment,
    environment: cfg.environment };
}

export async function authorizeNetMerchantApi<T>(organizationId: string, operationName: string,
  fields: Record<string, unknown>) {
  const cfg = authorizeNetPartnerConfig();
  if (!cfg.ready || !['authenticateTestRequest','getHostedPaymentPageRequest','getTransactionDetailsRequest'].includes(operationName)) {
    throw new Error('AUTHNET_OPERATION_UNAVAILABLE');
  }
  await ensureAuthorizeNetTables();
  const rows = await prisma.$queryRawUnsafe<MerchantRow[]>(
    'SELECT merchantId, accessCiphertext, refreshCiphertext, expiresAtMs, environment, status ' +
    'FROM AuthorizeNetMerchantConnection WHERE organizationId = ? LIMIT 1', organizationId
  );
  const row = rows[0];
  if (!row || row.status !== 'CONNECTED' || row.environment !== cfg.environment) {
    throw new Error('AUTHNET_MERCHANT_NOT_CONNECTED');
  }
  let token = decryptSquareCredential(row.accessCiphertext, cfg.credentialKey);
  if (row.expiresAtMs <= Date.now() + 120_000) {
    const refreshed = await oauthTokenRequest(cfg, {
      grant_type: 'refresh_token',
      refresh_token: decryptSquareCredential(row.refreshCiphertext, cfg.credentialKey),
    });
    if (merchantIdFromAuthorizeNetToken(refreshed.access_token!) !== row.merchantId) {
      throw new Error('AUTHNET_MERCHANT_REFRESH_MISMATCH');
    }
    token = refreshed.access_token!;
    await prisma.$executeRawUnsafe(
      'UPDATE AuthorizeNetMerchantConnection SET accessCiphertext = ?, refreshCiphertext = ?, expiresAtMs = ?, ' +
      'updatedAt = CURRENT_TIMESTAMP WHERE organizationId = ? AND merchantId = ? AND environment = ?',
      encryptSquareCredential(refreshed.access_token!, cfg.credentialKey),
      encryptSquareCredential(refreshed.refresh_token!, cfg.credentialKey),
      Date.now() + Math.max(60, Number(refreshed.expires_in)) * 1000,
      organizationId, row.merchantId, cfg.environment,
    );
  }
  return authorizeNetMerchantRequest<T>(token, cfg.environment, {
    [operationName]: { merchantAuthentication: { accessToken: token }, ...fields },
  });
}
