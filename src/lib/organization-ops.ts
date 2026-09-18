import { createHash, createHmac, randomBytes, randomUUID } from 'crypto';
import { prisma } from './prisma';
import { emailDeliveryConfigured, sendTransactionalEmail } from './email-delivery';

export const PROFESSIONAL_PRICE_CENTS = 29900;
export const PROFESSIONAL_PLAN = 'professional';

let developmentOperationsTablesReady: Promise<void> | null = null;

export async function ensureOperationsTables() {
  // Production schema is applied by Cloudflare D1 migrations during deploy.
  // Keep the legacy bootstrap only for local development so normal production
  // page/API requests never execute schema DDL.
  if (process.env.NODE_ENV === 'production') return;

  if (!developmentOperationsTablesReady) {
    developmentOperationsTablesReady = (async () => {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS OrganizationBillingProfile (
          organizationId TEXT PRIMARY KEY NOT NULL,
          plan TEXT NOT NULL DEFAULT 'professional',
          priceCents INTEGER NOT NULL DEFAULT 29900,
          currency TEXT NOT NULL DEFAULT 'usd',
          subscriptionStatus TEXT NOT NULL DEFAULT 'NOT_CONNECTED',
          provider TEXT NOT NULL DEFAULT 'STRIPE',
          providerCustomerId TEXT,
          providerSubscriptionId TEXT,
          updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `);

      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS EmailOutbox (
          id TEXT PRIMARY KEY NOT NULL,
          organizationId TEXT NOT NULL,
          recipient TEXT NOT NULL,
          subject TEXT NOT NULL,
          templateKey TEXT NOT NULL,
          bodyText TEXT NOT NULL,
          payloadJson TEXT NOT NULL DEFAULT '{}',
          status TEXT NOT NULL DEFAULT 'QUEUED',
          providerMessageId TEXT,
          lastError TEXT,
          createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          sentAt TEXT
        )
      `);
      await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS EmailOutbox_org_status ON EmailOutbox (organizationId, status, createdAt)`);

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
      await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS ApiCredential_org_active ON ApiCredential (organizationId, active)`);

      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS WebhookEndpoint (
          id TEXT PRIMARY KEY NOT NULL,
          organizationId TEXT NOT NULL,
          url TEXT NOT NULL,
          secret TEXT NOT NULL,
          eventTypesJson TEXT NOT NULL DEFAULT '["*"]',
          active INTEGER NOT NULL DEFAULT 1,
          createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          lastDeliveryAt TEXT,
          lastStatus INTEGER,
          lastError TEXT
        )
      `);
      await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS WebhookEndpoint_org_active ON WebhookEndpoint (organizationId, active)`);

      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS WebhookDelivery (
          id TEXT PRIMARY KEY NOT NULL,
          organizationId TEXT NOT NULL,
          endpointId TEXT NOT NULL,
          eventType TEXT NOT NULL,
          responseStatus INTEGER,
          success INTEGER NOT NULL DEFAULT 0,
          error TEXT,
          createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `);
      await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS WebhookDelivery_org_created ON WebhookDelivery (organizationId, createdAt)`);

      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS CustomDomain (
          organizationId TEXT PRIMARY KEY NOT NULL,
          hostname TEXT NOT NULL UNIQUE,
          verificationToken TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'PENDING',
          verifiedAt TEXT,
          updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `);
    })().catch((error) => {
      developmentOperationsTablesReady = null;
      throw error;
    });
  }

  return developmentOperationsTablesReady;
}

export type BillingProfile = {
  organizationId: string;
  plan: string;
  priceCents: number;
  currency: string;
  subscriptionStatus: string;
  provider: string;
  providerCustomerId: string | null;
  providerSubscriptionId: string | null;
  updatedAt: string;
};

export async function getBillingProfile(organizationId: string) {
  await ensureOperationsTables();
  const rows = await prisma.$queryRawUnsafe<BillingProfile[]>(
    `SELECT * FROM OrganizationBillingProfile WHERE organizationId = ? LIMIT 1`,
    organizationId,
  );
  return rows[0];
}

export async function ensureBillingProfile(organizationId: string) {
  await ensureOperationsTables();
  await prisma.$executeRawUnsafe(
    `INSERT INTO OrganizationBillingProfile
      (organizationId, plan, priceCents, currency, subscriptionStatus, provider, updatedAt)
     VALUES (?, ?, ?, 'usd', 'NOT_CONNECTED', 'STRIPE', CURRENT_TIMESTAMP)
     ON CONFLICT(organizationId) DO UPDATE SET
       plan = excluded.plan,
       priceCents = excluded.priceCents,
       updatedAt = CURRENT_TIMESTAMP`,
    organizationId,
    PROFESSIONAL_PLAN,
    PROFESSIONAL_PRICE_CENTS,
  );

  return getBillingProfile(organizationId);
}

export async function queueEmail(input: {
  organizationId: string;
  recipient: string;
  templateKey: string;
  subject: string;
  bodyText: string;
  payload?: Record<string, unknown>;
}) {
  await ensureOperationsTables();
  const id = randomUUID();
  const recipient = input.recipient.toLowerCase();
  await prisma.$executeRawUnsafe(
    `INSERT INTO EmailOutbox
      (id, organizationId, recipient, subject, templateKey, bodyText, payloadJson, status, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'QUEUED', CURRENT_TIMESTAMP)`,
    id,
    input.organizationId,
    recipient,
    input.subject,
    input.templateKey,
    input.bodyText,
    JSON.stringify(input.payload || {}),
  );

  if (emailDeliveryConfigured()) {
    try {
      const delivery = await sendTransactionalEmail({
        recipient,
        subject: input.subject,
        bodyText: input.bodyText,
        idempotencyKey: `ica-email-${id}`,
      });
      if (delivery.sent) {
        await prisma.$executeRawUnsafe(
          `UPDATE EmailOutbox
           SET status = 'SENT', providerMessageId = ?, lastError = NULL, sentAt = CURRENT_TIMESTAMP
           WHERE id = ?`,
          delivery.providerMessageId,
          id,
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Email delivery failed.';
      await prisma.$executeRawUnsafe(
        `UPDATE EmailOutbox
         SET status = 'FAILED', lastError = ?
         WHERE id = ?`,
        message.slice(0, 500),
        id,
      );
      console.error('ICA_EMAIL_DELIVERY_ERROR', message);
    }
  }

  return id;
}

export function renderInvitationEmail(input: {
  organizationName: string;
  recipientName: string;
  inviteUrl: string;
  expiresLabel?: string;
}) {
  return {
    subject: `You're invited to ${input.organizationName} on ICA Unified`,
    bodyText:
      `Hello ${input.recipientName},\n\n` +
      `${input.organizationName} invited you to activate your ICA Unified account.\n\n` +
      `Activate account: ${input.inviteUrl}\n\n` +
      `This secure link ${input.expiresLabel || 'expires soon'}.\n\nICA Unified · Built by I Computer Anything`,
  };
}

export async function listEmailOutbox(organizationId: string, limit = 50) {
  await ensureOperationsTables();
  return prisma.$queryRawUnsafe<Array<{
    id: string;
    recipient: string;
    subject: string;
    templateKey: string;
    status: string;
    createdAt: string;
    sentAt: string | null;
    lastError: string | null;
  }>>(
    `SELECT id, recipient, subject, templateKey, status, createdAt, sentAt, lastError
     FROM EmailOutbox
     WHERE organizationId = ?
     ORDER BY createdAt DESC
     LIMIT ?`,
    organizationId,
    limit,
  );
}


export async function retryEmailOutbox(organizationId: string, limit = 50) {
  await ensureOperationsTables();
  if (!emailDeliveryConfigured()) {
    return { attempted: 0, sent: 0, failed: 0, skipped: true };
  }

  const rows = await prisma.$queryRawUnsafe<Array<{
    id: string;
    recipient: string;
    subject: string;
    bodyText: string;
  }>>(
    `SELECT id, recipient, subject, bodyText
     FROM EmailOutbox
     WHERE organizationId = ? AND status IN ('QUEUED','FAILED')
     ORDER BY createdAt ASC
     LIMIT ?`,
    organizationId,
    limit,
  );

  let sent = 0;
  let failed = 0;

  for (const row of rows) {
    try {
      const delivery = await sendTransactionalEmail({
        recipient: row.recipient,
        subject: row.subject,
        bodyText: row.bodyText,
        idempotencyKey: `ica-email-${row.id}`,
      });

      if (delivery.sent) {
        sent += 1;
        await prisma.$executeRawUnsafe(
          `UPDATE EmailOutbox
           SET status = 'SENT', providerMessageId = ?, lastError = NULL, sentAt = CURRENT_TIMESTAMP
           WHERE id = ?`,
          delivery.providerMessageId,
          row.id,
        );
      }
    } catch (error) {
      failed += 1;
      const message = error instanceof Error ? error.message : 'Email delivery failed.';
      await prisma.$executeRawUnsafe(
        `UPDATE EmailOutbox SET status = 'FAILED', lastError = ? WHERE id = ?`,
        message.slice(0, 500),
        row.id,
      );
    }
  }

  return { attempted: rows.length, sent, failed, skipped: false };
}

export async function createApiKey(organizationId: string, createdById: string, name: string) {
  await ensureOperationsTables();
  const raw = `ica_live_${randomBytes(28).toString('base64url')}`;
  const keyHash = createHash('sha256').update(raw).digest('hex');
  const keyPrefix = raw.slice(0, 16);
  const id = randomUUID();

  await prisma.$executeRawUnsafe(
    `INSERT INTO ApiCredential
      (id, organizationId, name, keyPrefix, keyHash, active, createdById, createdAt)
     VALUES (?, ?, ?, ?, ?, 1, ?, CURRENT_TIMESTAMP)`,
    id,
    organizationId,
    name,
    keyPrefix,
    keyHash,
    createdById,
  );

  return { id, raw, keyPrefix, name };
}

export async function authenticateApiKey(rawKey: string) {
  await ensureOperationsTables();
  const keyHash = createHash('sha256').update(rawKey).digest('hex');
  const rows = await prisma.$queryRawUnsafe<Array<{
    id: string;
    organizationId: string;
    name: string;
    active: number;
  }>>(
    `SELECT id, organizationId, name, active
     FROM ApiCredential
     WHERE keyHash = ? AND active = 1
     LIMIT 1`,
    keyHash,
  );
  const match = rows[0];
  if (!match) return null;

  await prisma.$executeRawUnsafe(
    `UPDATE ApiCredential SET lastUsedAt = CURRENT_TIMESTAMP WHERE id = ?`,
    match.id,
  );
  return match;
}

export async function listApiKeys(organizationId: string) {
  await ensureOperationsTables();
  return prisma.$queryRawUnsafe<Array<{
    id: string;
    name: string;
    keyPrefix: string;
    active: number;
    createdAt: string;
    lastUsedAt: string | null;
  }>>(
    `SELECT id, name, keyPrefix, active, createdAt, lastUsedAt
     FROM ApiCredential
     WHERE organizationId = ?
     ORDER BY createdAt DESC`,
    organizationId,
  );
}

export async function revokeApiKey(organizationId: string, id: string) {
  await ensureOperationsTables();
  await prisma.$executeRawUnsafe(
    `UPDATE ApiCredential SET active = 0 WHERE id = ? AND organizationId = ?`,
    id,
    organizationId,
  );
}

export async function createWebhook(input: {
  organizationId: string;
  url: string;
  eventTypes: string[];
}) {
  await ensureOperationsTables();
  const id = randomUUID();
  const secret = `whsec_${randomBytes(24).toString('base64url')}`;
  await prisma.$executeRawUnsafe(
    `INSERT INTO WebhookEndpoint
      (id, organizationId, url, secret, eventTypesJson, active, createdAt)
     VALUES (?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP)`,
    id,
    input.organizationId,
    input.url,
    secret,
    JSON.stringify(input.eventTypes.length ? input.eventTypes : ['*']),
  );
  return { id, secret };
}

export async function listWebhooks(organizationId: string) {
  await ensureOperationsTables();
  return prisma.$queryRawUnsafe<Array<{
    id: string;
    url: string;
    secret: string;
    eventTypesJson: string;
    active: number;
    createdAt: string;
    lastDeliveryAt: string | null;
    lastStatus: number | null;
    lastError: string | null;
  }>>(
    `SELECT id, url, secret, eventTypesJson, active, createdAt, lastDeliveryAt, lastStatus, lastError
     FROM WebhookEndpoint
     WHERE organizationId = ?
     ORDER BY createdAt DESC`,
    organizationId,
  );
}

export async function deleteWebhook(organizationId: string, id: string) {
  await ensureOperationsTables();
  await prisma.$executeRawUnsafe(
    `DELETE FROM WebhookEndpoint WHERE id = ? AND organizationId = ?`,
    id,
    organizationId,
  );
}

export async function emitOrganizationEvent(
  organizationId: string,
  eventType: string,
  payload: Record<string, unknown>,
) {
  await ensureOperationsTables();
  const endpoints = await prisma.$queryRawUnsafe<Array<{
    id: string;
    url: string;
    secret: string;
    eventTypesJson: string;
  }>>(
    `SELECT id, url, secret, eventTypesJson
     FROM WebhookEndpoint
     WHERE organizationId = ? AND active = 1`,
    organizationId,
  );

  const body = JSON.stringify({
    id: randomUUID(),
    event: eventType,
    createdAt: new Date().toISOString(),
    data: payload,
  });

  const deliveries = await Promise.allSettled(endpoints.map(async (endpoint) => {
    let eventTypes: string[] = ['*'];
    try { eventTypes = JSON.parse(endpoint.eventTypesJson || '["*"]'); } catch {}
    if (!eventTypes.includes('*') && !eventTypes.includes(eventType)) return null;

    const signature = createHmac('sha256', endpoint.secret).update(body).digest('hex');
    let status: number | null = null;
    let error: string | null = null;
    let success = false;

    try {
      const response = await fetch(endpoint.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-ICA-Event': eventType,
          'X-ICA-Signature': `sha256=${signature}`,
        },
        body,
        signal: AbortSignal.timeout(8000),
      });
      status = response.status;
      success = response.ok;
      if (!response.ok) error = `HTTP ${response.status}`;
    } catch (caught) {
      error = caught instanceof Error ? caught.message : 'Webhook delivery failed';
    }

    await prisma.$executeRawUnsafe(
      `UPDATE WebhookEndpoint
       SET lastDeliveryAt = CURRENT_TIMESTAMP, lastStatus = ?, lastError = ?
       WHERE id = ?`,
      status,
      error,
      endpoint.id,
    );
    await prisma.$executeRawUnsafe(
      `INSERT INTO WebhookDelivery
       (id, organizationId, endpointId, eventType, responseStatus, success, error, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      randomUUID(),
      organizationId,
      endpoint.id,
      eventType,
      status,
      success ? 1 : 0,
      error,
    );
    return { endpointId: endpoint.id, success, status, error };
  }));

  return deliveries;
}

export async function setCustomDomain(organizationId: string, hostname: string) {
  await ensureOperationsTables();
  const token = randomBytes(18).toString('base64url');
  await prisma.$executeRawUnsafe(
    `INSERT INTO CustomDomain
      (organizationId, hostname, verificationToken, status, verifiedAt, updatedAt)
     VALUES (?, ?, ?, 'PENDING', NULL, CURRENT_TIMESTAMP)
     ON CONFLICT(organizationId) DO UPDATE SET
       hostname = excluded.hostname,
       verificationToken = excluded.verificationToken,
       status = 'PENDING',
       verifiedAt = NULL,
       updatedAt = CURRENT_TIMESTAMP`,
    organizationId,
    hostname,
    token,
  );
  return { hostname, verificationToken: token, status: 'PENDING' as const };
}

export async function getCustomDomain(organizationId: string) {
  await ensureOperationsTables();
  const rows = await prisma.$queryRawUnsafe<Array<{
    organizationId: string;
    hostname: string;
    verificationToken: string;
    status: string;
    verifiedAt: string | null;
    updatedAt: string;
  }>>(
    `SELECT * FROM CustomDomain WHERE organizationId = ? LIMIT 1`,
    organizationId,
  );
  return rows[0] || null;
}

export async function verifyCustomDomain(organizationId: string) {
  const domain = await getCustomDomain(organizationId);
  if (!domain) return { verified: false, error: 'No custom domain has been configured.' };

  const txtName = `_ica-unified.${domain.hostname}`;
  const expected = `ica-domain-verification=${domain.verificationToken}`;

  try {
    const response = await fetch(
      `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(txtName)}&type=TXT`,
      { headers: { Accept: 'application/dns-json' } },
    );
    const data = await response.json() as { Answer?: Array<{ data?: string }> };
    const values = (data.Answer || []).map((answer) => String(answer.data || '').replace(/^"|"$/g, ''));
    const verified = values.some((value) => value.includes(expected));
    if (!verified) return { verified: false, error: `TXT record not found at ${txtName}.` };

    await prisma.$executeRawUnsafe(
      `UPDATE CustomDomain
       SET status = 'VERIFIED', verifiedAt = CURRENT_TIMESTAMP, updatedAt = CURRENT_TIMESTAMP
       WHERE organizationId = ?`,
      organizationId,
    );
    return { verified: true };
  } catch (error) {
    return { verified: false, error: error instanceof Error ? error.message : 'DNS verification failed.' };
  }
}

export async function resolveVerifiedCustomDomain(hostname: string) {
  await ensureOperationsTables();
  const normalized = hostname.trim().toLowerCase().replace(/:\d+$/, '').replace(/\.$/, '');
  if (!normalized) return null;

  const rows = await prisma.$queryRawUnsafe<Array<{
    organizationId: string;
    hostname: string;
  }>>(
    `SELECT organizationId, hostname
     FROM CustomDomain
     WHERE hostname = ? AND status = 'VERIFIED'
     LIMIT 1`,
    normalized,
  );
  const match = rows[0];
  if (!match) return null;

  const organization = await prisma.organization.findUnique({
    where: { id: match.organizationId },
    select: { id: true, name: true, slug: true, status: true },
  });
  if (!organization || ['SUSPENDED', 'CANCELLED'].includes(organization.status)) return null;

  return {
    ...organization,
    hostname: match.hostname,
  };
}
