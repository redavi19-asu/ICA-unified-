import { appleSigningConfigured, appleClientSecret } from './apple-client-secret';
import { createHash, randomBytes } from 'crypto';
import bcrypt from 'bcryptjs';
import { importJWK, jwtVerify } from 'jose';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { prisma } from './prisma';
import { createSession, sessionCookie } from './auth';
import { createPlatformSession } from './platform-auth';
import { findIcaMasterOwnerByEmail } from './ica-master-auth';
import { markUserEmailVerified } from './security';

export type SocialProvider = 'google' | 'apple' | 'microsoft';
type SocialPurpose = 'login' | 'register';

const STATE_TTL_MS = 10 * 60 * 1000;
const TICKET_TTL_MS = 10 * 60 * 1000;

const PROVIDERS = {
  google: {
    label: 'Google',
    authorize: 'https://accounts.google.com/o/oauth2/v2/auth',
    token: 'https://oauth2.googleapis.com/token',
    jwks: 'https://www.googleapis.com/oauth2/v3/certs',
    scope: 'openid email profile',
  },
  apple: {
    label: 'Apple',
    authorize: 'https://appleid.apple.com/auth/authorize',
    token: 'https://appleid.apple.com/auth/token',
    jwks: 'https://appleid.apple.com/auth/keys',
    scope: 'name email',
  },
  microsoft: {
    label: 'Microsoft',
    authorize: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
    token: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    jwks: 'https://login.microsoftonline.com/common/discovery/v2.0/keys',
    scope: 'openid email profile',
  },
} as const;

type D1StatementLike = {
  bind: (...values: unknown[]) => D1StatementLike;
  run: () => Promise<{ success?: boolean }>;
  first: <T = Record<string, unknown>>() => Promise<T | null>;
};

type D1DatabaseLike = {
  prepare: (sql: string) => D1StatementLike;
};

type UnifiedBindings = {
  DB?: D1DatabaseLike;
  [key: string]: unknown;
};

function bindings(): UnifiedBindings {
  return getCloudflareContext().env as unknown as UnifiedBindings;
}

function db() {
  const database = bindings().DB;
  if (!database) throw new Error('ICA Unified application database is unavailable.');
  return database;
}

function envValue(name: string) {
  return String(bindings()[name] || '').trim();
}

function providerConfig(provider: SocialProvider) {
  const upper = provider.toUpperCase();
  const clientId = envValue('SOCIAL_' + upper + '_CLIENT_ID');
  const clientSecret = envValue('SOCIAL_' + upper + '_CLIENT_SECRET');
  return { ...PROVIDERS[provider], provider, clientId, clientSecret, ready: Boolean(clientId && (clientSecret || (provider === 'apple' && appleSigningConfigured(bindings())))) };
}

export function socialProviderStatus() {
  return {
    google: providerConfig('google').ready,
    apple: providerConfig('apple').ready,
    microsoft: providerConfig('microsoft').ready,
  };
}

function digest(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

function randomToken(bytes = 32) {
  return randomBytes(bytes).toString('base64url');
}

async function ensureTables() {
  const database = db();
  await database.prepare(
    'CREATE TABLE IF NOT EXISTS SocialAuthState (' +
    'stateHash TEXT PRIMARY KEY NOT NULL,' +
    'provider TEXT NOT NULL,' +
    'purpose TEXT NOT NULL,' +
    'codeVerifier TEXT NOT NULL,' +
    'nonce TEXT NOT NULL,' +
    'organizationSlug TEXT,' +
    'expiresAt INTEGER NOT NULL,' +
    'createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)'
  ).run();
  await database.prepare(
    'CREATE TABLE IF NOT EXISTS SocialIdentity (' +
    'provider TEXT NOT NULL,' +
    'providerSubject TEXT NOT NULL,' +
    'userId TEXT NOT NULL,' +
    'email TEXT NOT NULL,' +
    'createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,' +
    'updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,' +
    'PRIMARY KEY (provider, providerSubject))'
  ).run();
  await database.prepare('CREATE INDEX IF NOT EXISTS SocialIdentity_userId ON SocialIdentity (userId)').run();
  await database.prepare(
    'CREATE TABLE IF NOT EXISTS SocialOnboardingTicket (' +
    'ticketHash TEXT PRIMARY KEY NOT NULL,' +
    'provider TEXT NOT NULL,' +
    'providerSubject TEXT NOT NULL,' +
    'email TEXT NOT NULL,' +
    'displayName TEXT NOT NULL,' +
    'expiresAt INTEGER NOT NULL,' +
    'usedAt INTEGER,' +
    'createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)'
  ).run();
}

function callbackOrigin(request: Request) {
  return (envValue('SOCIAL_AUTH_ORIGIN') || new URL(request.url).origin).replace(/\/$/, '');
}

export async function beginSocialAuth(request: Request, provider: SocialProvider) {
  await ensureTables();
  const config = providerConfig(provider);
  if (!config.ready) throw new Error(config.label + ' sign-in is not configured yet.');

  const url = new URL(request.url);
  const purpose: SocialPurpose = url.searchParams.get('purpose') === 'register' ? 'register' : 'login';
  const organizationSlug = String(url.searchParams.get('organizationSlug') || '').trim().toLowerCase();
  const state = randomToken(32);
  const verifier = randomToken(48);
  const nonce = randomToken(24);
  const now = Date.now();

  await db().prepare('DELETE FROM SocialAuthState WHERE expiresAt <= ?').bind(now).run();
  await db().prepare(
    'INSERT INTO SocialAuthState ' +
    '(stateHash, provider, purpose, codeVerifier, nonce, organizationSlug, expiresAt) ' +
    'VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).bind(
    digest(state),
    provider,
    purpose,
    verifier,
    nonce,
    organizationSlug || null,
    now + STATE_TTL_MS,
  ).run();

  const target = new URL(config.authorize);
  target.searchParams.set('client_id', config.clientId);
  target.searchParams.set('redirect_uri', callbackOrigin(request) + '/api/auth/social/' + provider + '/callback');
  target.searchParams.set('response_type', 'code');
  target.searchParams.set('scope', config.scope);
  target.searchParams.set('state', state);
  target.searchParams.set('nonce', nonce);
  target.searchParams.set('code_challenge', createHash('sha256').update(verifier).digest('base64url'));
  target.searchParams.set('code_challenge_method', 'S256');
  if (provider === 'google') {
    target.searchParams.set('access_type', 'online');
    target.searchParams.set('prompt', 'select_account');
  }
  if (provider === 'microsoft') target.searchParams.set('response_mode', 'query');
  if (provider === 'apple') target.searchParams.set('response_mode', 'form_post');
  return target.toString();
}

async function callbackParams(request: Request) {
  if (request.method.toUpperCase() === 'POST') {
    const form = await request.formData();
    return Object.fromEntries(form.entries()) as Record<string, string>;
  }
  return Object.fromEntries(new URL(request.url).searchParams.entries());
}

async function verifyIdToken(idToken: string, provider: SocialProvider, nonce: string) {
  const config = providerConfig(provider);
  const encodedHeader = idToken.split('.')[0];
  if (!encodedHeader) throw new Error('Identity provider returned an invalid token.');
  const header = JSON.parse(Buffer.from(encodedHeader, 'base64url').toString('utf8')) as { kid?: string; alg?: string };
  if (!header.kid || header.alg !== 'RS256') throw new Error('Unsupported identity token signature.');

  const response = await fetch(config.jwks, { headers: { accept: 'application/json' } });
  if (!response.ok) throw new Error('Identity provider signing keys are unavailable.');
  type JoseJwk = Parameters<typeof importJWK>[0] & { kid?: string };
  const keyPayload = await response.json() as { keys?: JoseJwk[] };
  const jwk = keyPayload.keys?.find((key) => key.kid === header.kid);
  if (!jwk) throw new Error('Identity provider signing key was not found.');

  const key = await importJWK(jwk, 'RS256');
  const result = await jwtVerify(idToken, key, { audience: config.clientId, clockTolerance: 30 });
  const claims = result.payload;
  if (nonce && claims.nonce !== nonce) throw new Error('Identity token nonce mismatch.');

  const issuer = String(claims.iss || '');
  if (provider === 'google' && !['https://accounts.google.com', 'accounts.google.com'].includes(issuer)) {
    throw new Error('Unexpected Google identity issuer.');
  }
  if (provider === 'apple' && issuer !== 'https://appleid.apple.com') {
    throw new Error('Unexpected Apple identity issuer.');
  }
  if (provider === 'microsoft' && !/^https:\/\/login\.microsoftonline\.com\/[0-9a-f-]+\/v2\.0$/i.test(issuer)) {
    throw new Error('Unexpected Microsoft identity issuer.');
  }
  return claims;
}

async function exchangeCode(request: Request, provider: SocialProvider, code: string, verifier: string) {
  const config = providerConfig(provider);
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    client_id: config.clientId,
    client_secret: config.provider === 'apple' && appleSigningConfigured(bindings()) ? await appleClientSecret(bindings(), config.clientId) : config.clientSecret,
    redirect_uri: callbackOrigin(request) + '/api/auth/social/' + provider + '/callback',
    code_verifier: verifier,
  });
  const response = await fetch(config.token, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
    body,
  });
  const payload = await response.json().catch(() => ({})) as { id_token?: string; error?: string; error_description?: string };
  if (!response.ok || !payload.id_token) {
    throw new Error(payload.error_description || payload.error || 'Identity provider token exchange failed.');
  }
  return payload.id_token;
}

async function issueRegistrationTicket(provider: SocialProvider, subject: string, email: string, displayName: string) {
  const raw = randomToken(32);
  const now = Date.now();
  await db().prepare('DELETE FROM SocialOnboardingTicket WHERE expiresAt <= ? OR usedAt IS NOT NULL').bind(now).run();
  await db().prepare(
    'INSERT INTO SocialOnboardingTicket ' +
    '(ticketHash, provider, providerSubject, email, displayName, expiresAt) ' +
    'VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(digest(raw), provider, subject, email, displayName, now + TICKET_TTL_MS).run();
  return raw;
}

async function linkIdentity(provider: SocialProvider, subject: string, userId: string, email: string) {
  await db().prepare(
    'INSERT INTO SocialIdentity ' +
    '(provider, providerSubject, userId, email, createdAt, updatedAt) ' +
    'VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) ' +
    'ON CONFLICT(provider, providerSubject) DO UPDATE SET ' +
    'userId = excluded.userId, email = excluded.email, updatedAt = CURRENT_TIMESTAMP'
  ).bind(provider, subject, userId, email).run();
}

async function findMembership(userId: string, organizationSlug = '') {
  if (organizationSlug) {
    return prisma.membership.findFirst({
      where: {
        userId,
        status: { not: 'SUSPENDED' },
        organization: { slug: organizationSlug },
      },
      include: { organization: true, user: true },
    });
  }

  return prisma.membership.findFirst({
    where: { userId, status: { not: 'SUSPENDED' } },
    include: { organization: true, user: true },
    orderBy: { joinedAt: 'asc' },
  });
}

export async function finishSocialCallback(request: Request, provider: SocialProvider) {
  await ensureTables();
  const params = await callbackParams(request);
  if (params.error) throw new Error(params.error_description || params.error);

  const row = await db().prepare(
    'SELECT provider, purpose, codeVerifier, nonce, organizationSlug, expiresAt ' +
    'FROM SocialAuthState WHERE stateHash = ? AND provider = ? AND expiresAt > ? LIMIT 1'
  ).bind(digest(String(params.state || '')), provider, Date.now()).first() as {
    purpose?: SocialPurpose;
    codeVerifier?: string;
    nonce?: string;
    organizationSlug?: string | null;
  } | null;

  if (!row?.codeVerifier || !row.nonce) throw new Error('Social sign-in expired. Start again.');
  await db().prepare('DELETE FROM SocialAuthState WHERE stateHash = ?')
    .bind(digest(String(params.state || ''))).run();

  const idToken = await exchangeCode(request, provider, String(params.code || ''), row.codeVerifier);
  const claims = await verifyIdToken(idToken, provider, row.nonce);
  const subject = String(claims.sub || '').trim();
  const email = String(claims.email || claims.preferred_username || '').trim().toLowerCase();

  let appleName = '';
  if (params.user) {
    try {
      const parsed = JSON.parse(String(params.user));
      appleName = [parsed?.name?.firstName, parsed?.name?.lastName].filter(Boolean).join(' ');
    } catch {}
  }

  const displayName = String(claims.name || appleName || email.split('@')[0] || 'ICA User').trim().slice(0, 100);

  if (!subject || !/^\S+@\S+\.\S+$/.test(email)) {
    throw new Error('Identity provider did not return a usable email address.');
  }
  if (provider === 'google' && claims.email_verified !== true) {
    throw new Error('Google did not verify this email address.');
  }

  const masterOwner = await findIcaMasterOwnerByEmail(email);
  if (masterOwner) {
    const localOnlyHash = await bcrypt.hash(randomToken(48), 12);
    const admin = await prisma.platformAdmin.upsert({
      where: { email: masterOwner.email },
      update: {
        name: masterOwner.displayName,
        role: 'MASTER',
        active: true,
      },
      create: {
        email: masterOwner.email,
        name: masterOwner.displayName,
        passwordHash: localOnlyHash,
        role: 'MASTER',
        active: true,
      },
    });

    const token = await createPlatformSession({
      platformAdminId: admin.id,
      role: 'MASTER',
    });
    return { kind: 'platform' as const, token };
  }

  if (row.purpose === 'register') {
    const ticket = await issueRegistrationTicket(provider, subject, email, displayName);
    return { kind: 'register' as const, ticket };
  }

  let user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    const linked = await db().prepare(
      'SELECT userId FROM SocialIdentity WHERE provider = ? AND providerSubject = ? LIMIT 1'
    ).bind(provider, subject).first() as { userId?: string } | null;
    if (linked?.userId) user = await prisma.user.findUnique({ where: { id: linked.userId } });
  }

  if (!user) {
    const ticket = await issueRegistrationTicket(provider, subject, email, displayName);
    return { kind: 'register' as const, ticket };
  }
  const membership = await findMembership(user.id, String(row.organizationSlug || ''));
  if (!membership) throw new Error('No active ICA Unified workspace was found for this account. Start or restore your organization access first.');

  await markUserEmailVerified(user.id);
  await linkIdentity(provider, subject, user.id, email);

  const token = await createSession({
    userId: user.id,
    organizationId: membership.organizationId,
    organizationSlug: membership.organization.slug,
    role: membership.role,
  });
  return { kind: 'login' as const, token };
}

export async function readSocialRegistrationTicket(raw: string) {
  await ensureTables();
  const row = await db().prepare(
    'SELECT provider, providerSubject, email, displayName, expiresAt ' +
    'FROM SocialOnboardingTicket WHERE ticketHash = ? AND usedAt IS NULL AND expiresAt > ? LIMIT 1'
  ).bind(digest(raw), Date.now()).first() as {
    provider?: SocialProvider;
    providerSubject?: string;
    email?: string;
    displayName?: string;
    expiresAt?: number;
  } | null;

  return row?.provider && row.providerSubject && row.email
    ? {
        provider: row.provider,
        providerSubject: row.providerSubject,
        email: row.email,
        displayName: row.displayName || row.email.split('@')[0],
        expiresAt: Number(row.expiresAt || 0),
      }
    : null;
}

async function consumeSocialRegistrationTicket(raw: string) {
  const profile = await readSocialRegistrationTicket(raw);
  if (!profile) return null;
  const now = Date.now();
  const result = await db().prepare(
    'UPDATE SocialOnboardingTicket SET usedAt = ? WHERE ticketHash = ? AND usedAt IS NULL AND expiresAt > ?'
  ).bind(now, digest(raw), now).run();
  return result?.success ? profile : null;
}

async function issueCompanyId() {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const code = 'ica-' + randomBytes(3).toString('hex');
    const existing = await prisma.organization.findUnique({ where: { slug: code } });
    if (!existing) return code;
  }
  throw new Error('Unable to issue a unique ICA Company ID.');
}

export async function completeSocialRegistration(ticket: string, organizationName: string) {
  const profile = await consumeSocialRegistrationTicket(ticket);
  if (!profile) throw new Error('Social onboarding expired. Start again.');

  const safeOrganizationName = organizationName.trim();
  if (safeOrganizationName.length < 2 || safeOrganizationName.length > 100) {
    throw new Error('Enter a valid company name.');
  }

  const existingUser = await prisma.user.findUnique({ where: { email: profile.email } });
  const companyId = await issueCompanyId();
  const trialEndsAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
  const generatedPasswordHash = existingUser ? null : await bcrypt.hash(randomToken(48), 12);

  const result = await prisma.$transaction(async (tx) => {
    const user = existingUser || await tx.user.create({
      data: {
        name: profile.displayName,
        email: profile.email,
        passwordHash: generatedPasswordHash as string,
      },
    });

    const organization = await tx.organization.create({
      data: {
        name: safeOrganizationName,
        slug: companyId,
        status: 'TRIAL',
        plan: 'trial',
        trialEndsAt,
      },
    });

    const membership = await tx.membership.create({
      data: {
        userId: user.id,
        organizationId: organization.id,
        role: 'OWNER',
        status: 'ACTIVE',
        jobTitle: 'Organization Owner',
      },
    });

    await tx.activity.create({
      data: {
        organizationId: organization.id,
        actorId: user.id,
        type: 'organization.created',
        message: organization.name + ' workspace created with ' + profile.provider + ' identity verification.',
      },
    });

    return { user, organization, membership };
  });

  await markUserEmailVerified(result.user.id);
  await linkIdentity(profile.provider, profile.providerSubject, result.user.id, profile.email);

  const token = await createSession({
    userId: result.user.id,
    organizationId: result.organization.id,
    organizationSlug: result.organization.slug,
    role: result.membership.role,
  });

  return {
    token,
    organization: {
      name: result.organization.name,
      slug: result.organization.slug,
      companyId: result.organization.slug.toUpperCase(),
    },
  };
}

export { sessionCookie };
