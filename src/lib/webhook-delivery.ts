import { createHmac, randomUUID } from 'node:crypto';

// Both the request-side Prisma adapter and the scheduled D1 adapter use this
// application interface. Claims live in SQL, never in isolate-local memory.
export interface WebhookDatabase {
  all<T>(sql: string, ...values: (string | number | null)[]): Promise<T[]>;
  run(sql: string, ...values: (string | number | null)[]): Promise<number>;
}
export const WEBHOOK_OUTBOX_SCHEMA = `CREATE TABLE IF NOT EXISTS WebhookOutbox (
  id TEXT PRIMARY KEY NOT NULL,
  organizationId TEXT NOT NULL,
  endpointId TEXT NOT NULL,
  eventId TEXT NOT NULL,
  eventType TEXT NOT NULL,
  payloadJson TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',
  attempts INTEGER NOT NULL DEFAULT 0,
  nextAttemptAt INTEGER NOT NULL,
  expiresAt INTEGER NOT NULL,
  leaseToken TEXT,
  leaseUntil INTEGER,
  responseStatus INTEGER,
  lastError TEXT,
  createdAt INTEGER NOT NULL,
  finishedAt INTEGER
)`;
export const WEBHOOK_OUTBOX_INDEX = 'CREATE INDEX IF NOT EXISTS WebhookOutbox_due ON WebhookOutbox (status, nextAttemptAt)';
const MAX_ATTEMPTS = 8;
const LEASE_MS = 90_000;
const DELIVERY_TTL_MS = 24 * 60 * 60_000;
const RETRY_DELAYS = [60_000, 5 * 60_000, 15 * 60_000, 30 * 60_000, 60 * 60_000, 120 * 60_000, 240 * 60_000];
type Delivery = {
  id: string; organizationId: string; endpointId: string; eventId: string;
  eventType: string; payloadJson: string; attempts: number; expiresAt: number;
};
type Endpoint = { url: string; secret: string };
export type DeliveryResult = { endpointId: string; success: boolean; status: number | null; error: string | null; queued: boolean };

export async function enqueueWebhookEvent(db: WebhookDatabase, input: {
  organizationId: string; endpointIds: string[]; eventId: string; eventType: string; body: string;
}, now = Date.now()) {
  if (!input.endpointIds.length) return [];
  // One SQL statement persists the complete fan-out atomically. json_each
  // keeps parameter count bounded even for organizations with many endpoints.
  await db.run(`INSERT INTO WebhookOutbox
    (id, organizationId, endpointId, eventId, eventType, payloadJson, nextAttemptAt, expiresAt, createdAt)
    SELECT ? || ':' || id, organizationId, id, ?, ?, ?, ?, ?, ? FROM WebhookEndpoint
    WHERE organizationId = ? AND active = 1 AND id IN (SELECT value FROM json_each(?))`,
    input.eventId, input.eventId, input.eventType, input.body, now, now + DELIVERY_TTL_MS,
    now, input.organizationId, JSON.stringify(input.endpointIds));
  const rows = await db.all<{ id: string }>('SELECT id FROM WebhookOutbox WHERE organizationId = ? AND eventId = ?', input.organizationId, input.eventId);
  return rows.map(row => row.id);
}

export async function deliverWebhook(db: WebhookDatabase, id: string, options: {
  now?: () => number; send?: typeof fetch;
} = {}): Promise<DeliveryResult | null> {
  const clock = options.now || Date.now;
  const now = clock();
  const lease = randomUUID();
  const claimed = await db.all<Delivery>(`UPDATE WebhookOutbox
    SET status = 'PROCESSING', leaseToken = ?, leaseUntil = ?, attempts = attempts + 1
    WHERE id = ? AND nextAttemptAt <= ? AND expiresAt > ? AND attempts < ?
      AND (status = 'PENDING' OR (status = 'PROCESSING' AND leaseUntil <= ?))
      AND EXISTS (SELECT 1 FROM WebhookEndpoint e WHERE e.id = WebhookOutbox.endpointId
        AND e.organizationId = WebhookOutbox.organizationId AND e.active = 1)
    RETURNING *`, lease, now + LEASE_MS, id, now, now, MAX_ATTEMPTS, now);
  if (!claimed.length) return null;
  const row = claimed[0];
  const endpoints = await db.all<Endpoint>(`SELECT e.url, e.secret FROM WebhookEndpoint e
    JOIN WebhookOutbox o ON o.endpointId = e.id AND o.organizationId = e.organizationId
    WHERE o.id = ? AND o.leaseToken = ? AND e.active = 1`, id, lease);
  if (!endpoints.length) {
    await db.run(`UPDATE WebhookOutbox SET status = 'CANCELLED', finishedAt = ?, payloadJson = '{}',
      leaseToken = NULL, leaseUntil = NULL WHERE id = ? AND leaseToken = ?`, clock(), id, lease);
    return null;
  }
  let status: number | null = null;
  let error: string | null = null;
  let success = false;
  try {
    const response = await (options.send || fetch)(endpoints[0].url, {
      method: 'POST', redirect: 'error',
      headers: {
        'Content-Type': 'application/json',
        'X-ICA-Event': row.eventType,
        'X-ICA-Event-ID': row.eventId,
        'X-ICA-Signature': `sha256=${createHmac('sha256', endpoints[0].secret).update(row.payloadJson).digest('hex')}`,
      },
      body: row.payloadJson, signal: AbortSignal.timeout(8000),
    });
    status = response.status;
    success = response.ok;
    if (!success) error = `HTTP ${status}`;
    // Receivers may return arbitrary data; do not buffer it or hold connections.
    await response.body?.cancel().catch(() => {});
  } catch {
    // Do not persist exception strings that can contain receiver URLs/secrets.
    error = 'Receiver request failed or timed out';
  }
  const finished = clock();
  const transient = status === null || status === 408 || status === 425 || status === 429 || status >= 500;
  const next = finished + RETRY_DELAYS[Math.min(row.attempts - 1, RETRY_DELAYS.length - 1)];
  const queued = !success && transient && row.attempts < MAX_ATTEMPTS && next < row.expiresAt;
  const state = success ? 'SENT' : queued ? 'PENDING' : 'FAILED';
  const changed = await db.run(`UPDATE WebhookOutbox SET status = ?, nextAttemptAt = ?,
    responseStatus = ?, lastError = ?, leaseToken = NULL, leaseUntil = NULL, finishedAt = ?,
    payloadJson = CASE WHEN ? = 'SENT' THEN '{}' ELSE payloadJson END
    WHERE id = ? AND leaseToken = ? AND status = 'PROCESSING'`,
    state, next, status, error, queued ? null : finished, state, id, lease);
  if (!changed) return null; // A recovered claim owns any later completion.
  await db.run(`UPDATE WebhookEndpoint SET lastDeliveryAt = CURRENT_TIMESTAMP,
    lastStatus = ?, lastError = ? WHERE id = ? AND organizationId = ?`,
    status, error, row.endpointId, row.organizationId);
  await db.run(`INSERT INTO WebhookDelivery
    (id, organizationId, endpointId, eventType, responseStatus, success, error, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
    randomUUID(), row.organizationId, row.endpointId, row.eventType, status, success ? 1 : 0, error);
  return { endpointId: row.endpointId, success, status, error, queued };
}

export async function drainWebhookOutbox(db: WebhookDatabase, options: {
  now?: () => number; send?: typeof fetch; limit?: number;
} = {}) {
  const now = (options.now || Date.now)();
  await db.run(WEBHOOK_OUTBOX_SCHEMA);
  await db.run(WEBHOOK_OUTBOX_INDEX);
  await db.run(`UPDATE WebhookOutbox SET status = 'CANCELLED', finishedAt = ?, payloadJson = '{}',
    leaseToken = NULL, leaseUntil = NULL
    WHERE (status = 'PENDING' OR (status = 'PROCESSING' AND leaseUntil <= ?))
      AND NOT EXISTS (SELECT 1 FROM WebhookEndpoint e WHERE e.id = WebhookOutbox.endpointId
        AND e.organizationId = WebhookOutbox.organizationId AND e.active = 1)`, now, now);
  await db.run(`UPDATE WebhookOutbox SET status = 'FAILED', finishedAt = ?,
    lastError = 'Delivery expired or retry limit reached', leaseToken = NULL, leaseUntil = NULL
    WHERE (status = 'PENDING' OR (status = 'PROCESSING' AND leaseUntil <= ?))
      AND (expiresAt <= ? OR attempts >= ?)`, now, now, now, MAX_ATTEMPTS);
  // Retain failed payloads for seven days; completed payloads are cleared at once.
  await db.run(`DELETE FROM WebhookOutbox WHERE status IN ('SENT', 'FAILED', 'CANCELLED')
    AND finishedAt < ?`, now - 7 * DELIVERY_TTL_MS);
  const rows = await db.all<{ id: string }>(`SELECT id FROM WebhookOutbox
    WHERE nextAttemptAt <= ? AND (status = 'PENDING' OR (status = 'PROCESSING' AND leaseUntil <= ?))
    ORDER BY nextAttemptAt, createdAt LIMIT ?`, now, now, Math.max(1, Math.min(options.limit || 40, 100)));
  const results: PromiseSettledResult<DeliveryResult | null>[] = [];
  // Four outbound connections at a time; leases prevent overlapping cron runs
  // or request/cron races from claiming the same delivery concurrently.
  for (let i = 0; i < rows.length; i += 4) {
    results.push(...await Promise.allSettled(rows.slice(i, i + 4).map(row => deliverWebhook(db, row.id, options))));
  }
  const errors = results.filter(result => result.status === 'rejected').length;
  if (errors) throw new Error(`${errors} webhook delivery operations failed; retained claims will be recovered`);
  return { processed: results.filter(result => result.status === 'fulfilled' && result.value !== null).length };
}
