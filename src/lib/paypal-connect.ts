import { createHash, randomBytes } from 'node:crypto';
import { prisma } from './prisma';

type PayPalEnvironment = 'sandbox' | 'production';
type PayPalStatus = {
  merchantId: string | null;
  connectionStatus: 'NOT_CONNECTED' | 'ONBOARDING' | 'ACTION_REQUIRED' | 'CONNECTED';
  environment: PayPalEnvironment;
};

const STATE_EXPIRY_MS = 10 * 60 * 1000;
let tablesReady: Promise<void> | null = null;

export function paypalPartnerConfig() {
  const environment: PayPalEnvironment = process.env.PAYPAL_ENVIRONMENT === 'production' ? 'production' : 'sandbox';
  const clientId = String(process.env.PAYPAL_PARTNER_CLIENT_ID || '').trim();
  const clientSecret = String(process.env.PAYPAL_PARTNER_CLIENT_SECRET || '').trim();
  const partnerMerchantId = String(process.env.PAYPAL_PARTNER_MERCHANT_ID || '').trim();
  const attributionId = String(process.env.PAYPAL_PARTNER_ATTRIBUTION_ID || '').trim();
  const approved = process.env.PAYPAL_PARTNER_APPROVED === 'true';
  const callbackUrl = String(process.env.PAYPAL_MERCHANT_RETURN_URL || '').trim();
  let callbackSafe = false;
  try {
    const url = new URL(callbackUrl);
    callbackSafe = url.protocol === 'https:' && !url.username && !url.password && !url.hash;
  } catch {}
  return {
    environment, clientId, clientSecret, partnerMerchantId, attributionId,
    callbackUrl,
    configured: Boolean(approved && clientId && clientSecret && partnerMerchantId && attributionId && callbackSafe),
  };
}

export function paypalApiRoot(environment: PayPalEnvironment) {
  return environment === 'production' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';
}

function assertPartnerReady() {
  const config = paypalPartnerConfig();
  if (!config.configured) throw new Error('PAYPAL_PARTNER_NOT_CONFIGURED');
  return config;
}

export function paypalMerchantAssertion(clientId: string, merchantId: string) {
  // PayPal's documented unsigned merchant-identity assertion, used alongside
  // authenticated platform OAuth and explicit partner/seller consent.
  if (!/^[A-Za-z0-9_-]{8,130}$/.test(merchantId) || !clientId) {
    throw new Error('INVALID_PAYPAL_MERCHANT_ID');
  }
  return [
    Buffer.from(JSON.stringify({ alg: 'none' })).toString('base64url'),
    Buffer.from(JSON.stringify({ iss: clientId, payer_id: merchantId })).toString('base64url'),
    '',
  ].join('.');
}

export async function paypalAccessToken() {
  const cfg = assertPartnerReady();
  const response = await fetch(paypalApiRoot(cfg.environment) + '/v1/oauth2/token', {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(cfg.clientId + ':' + cfg.clientSecret).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ grant_type: 'client_credentials' }),
    cache: 'no-store',
  });
  if (!response.ok) throw new Error('PAYPAL_AUTH_UNAVAILABLE');
  const result = await response.json() as { access_token?: string };
  if (!result.access_token) throw new Error('PAYPAL_AUTH_UNAVAILABLE');
  return result.access_token;
}

export async function paypalPartnerApi<T>(
  path: string,
  init: { method?: 'GET' | 'POST'; body?: object; merchantId?: string; requestId?: string; preferRepresentation?: boolean } = {},
): Promise<T> {
  const cfg = assertPartnerReady();
  if (!/^\/(?:v2\/customer\/partner-referrals|v1\/customer\/partners\/|v2\/checkout\/orders(?:\/|$)|v2\/payments\/(?:captures|refunds)\/)/.test(path)) {
    throw new Error('UNSUPPORTED_PAYPAL_API_PATH');
  }
  const accessToken = await paypalAccessToken();
  const response = await fetch(paypalApiRoot(cfg.environment) + path, {
    method: init.method || 'GET',
    headers: {
      Authorization: 'Bearer ' + accessToken,
      'Content-Type': 'application/json',
      'PayPal-Partner-Attribution-Id': cfg.attributionId,
      ...(init.merchantId ? { 'PayPal-Auth-Assertion': paypalMerchantAssertion(cfg.clientId, init.merchantId) } : {}),
      ...(init.requestId ? { 'PayPal-Request-Id': init.requestId } : {}),
      ...(init.preferRepresentation ? { Prefer: 'return=representation' } : {}),
    },
    ...(init.body ? { body: JSON.stringify(init.body) } : {}),
    cache: 'no-store',
  });
  if (!response.ok) throw new Error('PAYPAL_PROVIDER_REQUEST_FAILED');
  return response.json() as Promise<T>;
}

async function ensurePayPalTables() {
  if (!tablesReady) {
    tablesReady = (async () => {
      await prisma.$executeRawUnsafe(
        'CREATE TABLE IF NOT EXISTS PayPalMerchantConnection (' +
        'organizationId TEXT PRIMARY KEY NOT NULL, merchantId TEXT, environment TEXT NOT NULL, ' +
        'connectionStatus TEXT NOT NULL, updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)'
      );
      await prisma.$executeRawUnsafe(
        'CREATE TABLE IF NOT EXISTS PayPalMerchantReferral (' +
        'trackingId TEXT PRIMARY KEY NOT NULL, organizationId TEXT NOT NULL, userId TEXT NOT NULL, ' +
        'environment TEXT NOT NULL, expiresAtMs INTEGER NOT NULL, consumedAtMs INTEGER, ' +
        'createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)'
      );
    })().catch((error) => { tablesReady = null; throw error; });
  }
  return tablesReady;
}

export function paypalReferralPayload(input: { trackingId: string; returnUrl: string }) {
  const url = new URL(input.returnUrl);
  if (url.protocol !== 'https:') throw new Error('PAYPAL_RETURN_URI_NOT_HTTPS');
  return {
    tracking_id: input.trackingId,
    operations: [{
      operation: 'API_INTEGRATION',
      api_integration_preference: {
        rest_api_integration: {
          integration_method: 'PAYPAL',
          integration_type: 'THIRD_PARTY',
          third_party_details: { features: ['PAYMENT', 'REFUND'] },
        },
      },
    }],
    products: ['EXPRESS_CHECKOUT'],
    partner_config_override: {
      return_url: input.returnUrl,
      return_url_description: 'Return to your ICA Unified business Payment Hub',
    },
    legal_consents: [{ type: 'SHARE_DATA_CONSENT', granted: true }],
  };
}

export async function startPayPalMerchantOnboarding(organizationId: string, userId: string) {
  const cfg = assertPartnerReady();
  await ensurePayPalTables();
  await prisma.$executeRawUnsafe('DELETE FROM PayPalMerchantReferral WHERE expiresAtMs <= ?', Date.now());
  const trackingId = randomBytes(24).toString('base64url');
  await prisma.$executeRawUnsafe(
    'INSERT INTO PayPalMerchantReferral (trackingId, organizationId, userId, environment, expiresAtMs) ' +
    'VALUES (?, ?, ?, ?, ?)',
    trackingId, organizationId, userId, cfg.environment, Date.now() + STATE_EXPIRY_MS
  );
  const result = await paypalPartnerApi<{
    links?: Array<{ rel: string; href: string }>;
  }>('/v2/customer/partner-referrals', {
    method: 'POST',
    body: paypalReferralPayload({ trackingId, returnUrl: cfg.callbackUrl }),
    merchantId: cfg.partnerMerchantId,
  });
  const action = result.links?.find((link) => link.rel === 'action_url')?.href || '';
  let url: URL;
  try { url = new URL(action); } catch { throw new Error('PAYPAL_REFERRAL_LINK_MISSING'); }
  const trustedHost = cfg.environment === 'sandbox' ? 'www.sandbox.paypal.com' : 'www.paypal.com';
  if (url.protocol !== 'https:' || url.hostname !== trustedHost) throw new Error('PAYPAL_REFERRAL_LINK_INVALID');
  return url.toString();
}

export function paypalMerchantReadyFromProvider(status: {
  payments_receivable?: boolean;
  primary_email_confirmed?: boolean;
  granted_permissions?: Array<{ permission?: string }> | string[];
  oauth_integrations?: Array<{ integration_type?: string; oauth_third_party?: { scopes?: string[] } }>;
}): boolean {
  return status.payments_receivable === true && status.primary_email_confirmed === true &&
    Array.isArray(status.oauth_integrations) && status.oauth_integrations.length > 0;
}

export async function confirmPayPalMerchantOnboarding(input: {
  organizationId: string;
  userId: string;
  trackingId: string;
  returnedMerchantId: string;
}) {
  const cfg = assertPartnerReady();
  await ensurePayPalTables();
  if (!/^[A-Za-z0-9_-]{16,130}$/.test(input.trackingId) ||
      !/^[A-Za-z0-9_-]{8,130}$/.test(input.returnedMerchantId)) {
    throw new Error('PAYPAL_CALLBACK_INVALID');
  }
  const rows = await prisma.$queryRawUnsafe<Array<{ trackingId: string }>>(
    'UPDATE PayPalMerchantReferral SET consumedAtMs = ? ' +
    'WHERE trackingId = ? AND organizationId = ? AND userId = ? AND environment = ? ' +
    'AND expiresAtMs > ? AND consumedAtMs IS NULL RETURNING trackingId',
    Date.now(), input.trackingId, input.organizationId, input.userId, cfg.environment, Date.now()
  );
  if (!rows.length) throw new Error('PAYPAL_CALLBACK_EXPIRED');

  const status = await paypalPartnerApi<{
    merchant_id?: string;
    payments_receivable?: boolean;
    primary_email_confirmed?: boolean;
    oauth_integrations?: Array<{ integration_type?: string }>;
  }>(
    '/v1/customer/partners/' + encodeURIComponent(cfg.partnerMerchantId) +
    '/merchant-integrations/' + encodeURIComponent(input.returnedMerchantId),
    { merchantId: cfg.partnerMerchantId }
  );
  if (status.merchant_id && status.merchant_id !== input.returnedMerchantId) {
    throw new Error('PAYPAL_MERCHANT_MISMATCH');
  }
  const connected = paypalMerchantReadyFromProvider(status);
  await prisma.$executeRawUnsafe(
    'INSERT INTO PayPalMerchantConnection (organizationId, merchantId, environment, connectionStatus) ' +
    'VALUES (?, ?, ?, ?) ON CONFLICT(organizationId) DO UPDATE SET ' +
    'merchantId=excluded.merchantId, environment=excluded.environment, ' +
    'connectionStatus=excluded.connectionStatus, updatedAt=CURRENT_TIMESTAMP',
    input.organizationId, input.returnedMerchantId, cfg.environment,
    connected ? 'CONNECTED' : 'ACTION_REQUIRED'
  );
  return { connected };
}


/**
 * Rechecks PayPal's current consent/capability state without involving ICA support.
 * A revoked account is marked ACTION_REQUIRED rather than allowing a stale checkout.
 */
export async function refreshPayPalMerchantStatus(organizationId: string): Promise<PayPalStatus> {
  const cfg = assertPartnerReady();
  const current = await getPayPalMerchantStatus(organizationId);
  if (!current.merchantId || current.environment !== cfg.environment) {
    return current;
  }
  const providerStatus = await paypalPartnerApi<{
    merchant_id?: string;
    payments_receivable?: boolean;
    primary_email_confirmed?: boolean;
    oauth_integrations?: Array<{ integration_type?: string }>;
  }>(
    '/v1/customer/partners/' + encodeURIComponent(cfg.partnerMerchantId) +
    '/merchant-integrations/' + encodeURIComponent(current.merchantId),
    { merchantId: cfg.partnerMerchantId }
  );
  if (providerStatus.merchant_id && providerStatus.merchant_id !== current.merchantId) {
    throw new Error('PAYPAL_MERCHANT_MISMATCH');
  }
  const next: PayPalStatus['connectionStatus'] =
    paypalMerchantReadyFromProvider(providerStatus) ? 'CONNECTED' : 'ACTION_REQUIRED';
  await prisma.$executeRawUnsafe(
    'UPDATE PayPalMerchantConnection SET connectionStatus = ?, updatedAt = CURRENT_TIMESTAMP ' +
    'WHERE organizationId = ? AND merchantId = ? AND environment = ?',
    next, organizationId, current.merchantId, cfg.environment
  );
  return { merchantId: current.merchantId, connectionStatus: next, environment: cfg.environment };
}

export async function getPayPalMerchantStatus(organizationId: string): Promise<PayPalStatus> {
  const cfg = paypalPartnerConfig();
  if (!cfg.configured) return { merchantId: null, connectionStatus: 'NOT_CONNECTED', environment: cfg.environment };
  await ensurePayPalTables();
  const rows = await prisma.$queryRawUnsafe<Array<{ merchantId: string | null; connectionStatus: string; environment: string }>>(
    'SELECT merchantId, connectionStatus, environment FROM PayPalMerchantConnection WHERE organizationId = ? LIMIT 1',
    organizationId
  );
  const row = rows[0];
  return {
    merchantId: row?.environment === cfg.environment ? row.merchantId : null,
    connectionStatus: row?.environment === cfg.environment && row.connectionStatus === 'CONNECTED' ? 'CONNECTED' :
      row?.environment === cfg.environment && row.connectionStatus === 'ACTION_REQUIRED' ? 'ACTION_REQUIRED' : 'NOT_CONNECTED',
    environment: cfg.environment,
  };
}
