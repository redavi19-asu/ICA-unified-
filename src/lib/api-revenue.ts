export interface RevenueDatabase {
  all<T>(sql: string, ...values: (string | number | null)[]): Promise<T[]>;
  run(sql: string, ...values: (string | number | null)[]): Promise<number>;
  batch(
    statements: { sql: string; values: (string | number | null)[] }[],
  ): Promise<{ changes: number; rows: Record<string, unknown>[] }[]>;
}
export const REVENUE_TABLES = [
  `CREATE TABLE IF NOT EXISTS ApiAccessSubscription(organizationId TEXT PRIMARY KEY,customerId TEXT UNIQUE,subscriptionId TEXT UNIQUE,status TEXT NOT NULL DEFAULT 'not_connected',periodStart INTEGER,periodEnd INTEGER,requestAllowance INTEGER,priceId TEXT,monthlyAmountCents INTEGER,updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS ApiUsagePeriod(organizationId TEXT NOT NULL,periodStart INTEGER NOT NULL,periodEnd INTEGER NOT NULL,used INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(organizationId,periodStart))`,
  `CREATE TABLE IF NOT EXISTS ApiUsageReservation(id TEXT PRIMARY KEY,organizationId TEXT NOT NULL,periodStart INTEGER NOT NULL,status TEXT NOT NULL DEFAULT 'RESERVED',expiresAt INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS ApiUsageReservation_expiry ON ApiUsageReservation(expiresAt)`,
];
export async function ensureApiRevenue(
  db: Pick<RevenueDatabase, "all" | "run">,
) {
  for (const sql of REVENUE_TABLES) await db.run(sql);
}
export function calendarPeriod(now: number) {
  const d = new Date(now);
  return {
    start: Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1),
    end: Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1),
  };
}
export function apiRevenueRequired(value?: string) {
  return value === "true";
}
export async function apiRevenueStatus(
  db: Pick<RevenueDatabase, "all" | "run">,
  organizationId: string,
  required: boolean,
  now = Date.now(),
) {
  await ensureApiRevenue(db);
  const [subscription] = await db.all<{
    status: string;
    periodStart: number | null;
    periodEnd: number | null;
    requestAllowance: number | null;
    subscriptionId: string | null;
    priceId: string | null;
    monthlyAmountCents: number | null;
  }>(
    "SELECT status,periodStart,periodEnd,requestAllowance,subscriptionId,priceId,monthlyAmountCents FROM ApiAccessSubscription WHERE organizationId=?",
    organizationId,
  );
  const entitled = Boolean(
    subscription?.subscriptionId &&
    subscription.priceId &&
    Number.isSafeInteger(subscription.monthlyAmountCents) &&
    subscription.monthlyAmountCents! > 0 &&
    subscription.status === "active" &&
    Number.isSafeInteger(subscription.periodStart) &&
    Number.isSafeInteger(subscription.periodEnd) &&
    subscription.periodStart! <= now &&
    subscription.periodEnd! > now &&
    Number.isSafeInteger(subscription.requestAllowance) &&
    subscription.requestAllowance! > 0,
  );
  const period =
    required && entitled
      ? { start: subscription!.periodStart!, end: subscription!.periodEnd! }
      : calendarPeriod(now);
  const [usage] = await db.all<{ used: number }>(
    "SELECT used FROM ApiUsagePeriod WHERE organizationId=? AND periodStart=?",
    organizationId,
    period.start,
  );
  return {
    mode: required ? "PAID_API_REQUIRED" : "PREPARATION",
    entitled,
    monthlyAmountCents: subscription?.monthlyAmountCents || null,
    subscriptionStatus: subscription?.status || "not_connected",
    periodStart: period.start,
    periodEnd: period.end,
    used: usage?.used || 0,
    allowance: required && entitled ? subscription!.requestAllowance : null,
  };
}
/** Reserve allowance atomically across every key owned by the company. */
export async function reserveApiUsage(
  db: RevenueDatabase,
  organizationId: string,
  required: boolean,
  now = Date.now(),
) {
  const state = await apiRevenueStatus(db, organizationId, required, now);
  if (required && !state.entitled)
    return {
      ok: false as const,
      status: 402,
      error: "A separate active API subscription is required.",
      code: "API_SUBSCRIPTION_REQUIRED",
    };
  const reservationId = crypto.randomUUID();
  const results = await db.batch([
    {
      sql: "INSERT INTO ApiUsagePeriod(organizationId,periodStart,periodEnd,used) VALUES (?,?,?,0) ON CONFLICT(organizationId,periodStart) DO NOTHING",
      values: [organizationId, state.periodStart, state.periodEnd],
    },
    {
      sql: `INSERT INTO ApiUsageReservation(id,organizationId,periodStart,expiresAt)
 SELECT ?,?,?,? WHERE EXISTS (SELECT 1 FROM ApiUsagePeriod WHERE organizationId=? AND periodStart=? AND (? IS NULL OR used<?))
 AND (?=0 OR EXISTS (SELECT 1 FROM ApiAccessSubscription WHERE organizationId=? AND status='active' AND subscriptionId IS NOT NULL AND priceId IS NOT NULL AND monthlyAmountCents>0 AND periodStart=? AND periodEnd=? AND periodEnd>? AND requestAllowance=?))`,
      values: [
        reservationId,
        organizationId,
        state.periodStart,
        now + 86400000,
        organizationId,
        state.periodStart,
        state.allowance,
        state.allowance,
        required ? 1 : 0,
        organizationId,
        state.periodStart,
        state.periodEnd,
        now,
        state.allowance,
      ],
    },
    {
      sql: "UPDATE ApiUsagePeriod SET used=used+1 WHERE organizationId=? AND periodStart=? AND EXISTS (SELECT 1 FROM ApiUsageReservation WHERE id=? AND status='RESERVED')",
      values: [organizationId, state.periodStart, reservationId],
    },
    {
      sql: "SELECT used FROM ApiUsagePeriod WHERE organizationId=? AND periodStart=?",
      values: [organizationId, state.periodStart],
    },
  ]);
  if (!results[1].changes)
    return {
      ok: false as const,
      status: 429,
      error:
        "Monthly API allowance reached or API access changed. Review your API plan or contact support.",
      code: "API_ALLOWANCE_EXCEEDED",
      retryAfter: Math.max(1, Math.ceil((state.periodEnd - now) / 1000)),
    };
  const used = Number(results[3].rows[0].used);
  return {
    ok: true as const,
    id: reservationId,
    periodStart: state.periodStart,
    periodEnd: state.periodEnd,
    remaining:
      state.allowance === null ? null : Math.max(0, state.allowance - used),
  };
}
export async function finalizeApiUsage(
  db: RevenueDatabase,
  reservationId: string,
  charge: boolean,
) {
  if (charge) {
    await db.run(
      "UPDATE ApiUsageReservation SET status='COUNTED' WHERE id=? AND status='RESERVED'",
      reservationId,
    );
    return;
  }
  await db.batch([
    {
      sql: `UPDATE ApiUsagePeriod SET used=MAX(0,used-1) WHERE (organizationId,periodStart) IN
 (SELECT organizationId,periodStart FROM ApiUsageReservation WHERE id=? AND status='RESERVED')`,
      values: [reservationId],
    },
    {
      sql: "UPDATE ApiUsageReservation SET status='RELEASED' WHERE id=? AND status='RESERVED'",
      values: [reservationId],
    },
  ]);
}
export async function withApiUsage(
  db: RevenueDatabase,
  organizationId: string,
  required: boolean,
  run: () => Promise<Response>,
) {
  const reservation = await reserveApiUsage(db, organizationId, required);
  if (!reservation.ok)
    return Response.json(
      { error: reservation.error, code: reservation.code },
      {
        status: reservation.status,
        headers: {
          "Cache-Control": "no-store",
          ...("retryAfter" in reservation
            ? { "Retry-After": String(reservation.retryAfter) }
            : {}),
        },
      },
    );
  let charge = false;
  try {
    const response = await run();
    charge = response.status < 500;
    if (reservation.remaining !== null)
      response.headers.set(
        "X-ICA-Monthly-Remaining",
        String(reservation.remaining),
      );
    response.headers.set(
      "X-ICA-Usage-Period-End",
      new Date(reservation.periodEnd).toISOString(),
    );
    return response;
  } catch (error) {
    const value =
      error && typeof error === "object"
        ? (error as { status?: unknown; name?: string; message?: string })
        : {};
    charge =
      (typeof value.status === "number" &&
        value.status >= 400 &&
        value.status < 500) ||
      value.name === "ZodError" ||
      value.name === "SyntaxError" ||
      ["Invalid input", "Payload too large"].includes(value.message || "");
    throw error;
  } finally {
    await finalizeApiUsage(db, reservation.id, charge);
  }
}
export async function purgeApiUsageReservations(
  db: RevenueDatabase,
  now = Date.now(),
) {
  await ensureApiRevenue(db);
  return db.run(
    "DELETE FROM ApiUsageReservation WHERE id IN (SELECT id FROM ApiUsageReservation WHERE expiresAt<=? LIMIT 100)",
    now,
  );
}
