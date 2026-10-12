import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import {
  ensureApiRevenue,
  reserveApiUsage,
  finalizeApiUsage,
  withApiUsage,
  apiRevenueStatus,
  purgeApiUsageReservations,
  type RevenueDatabase,
} from "../src/lib/api-revenue";
function fixture() {
  const sqlite = new DatabaseSync(":memory:");
  const db: RevenueDatabase = {
    async all<T>(sql: string, ...values: (string | number | null)[]) {
      return sqlite.prepare(sql).all(...values) as T[];
    },
    async run(sql, ...values) {
      return Number(sqlite.prepare(sql).run(...values).changes);
    },
    async batch(statements) {
      sqlite.exec("BEGIN IMMEDIATE");
      try {
        const results = statements.map((s) => {
          const rows = sqlite.prepare(s.sql).all(...s.values);
          return {
            rows,
            changes: Number(sqlite.prepare("SELECT changes() n").get()!.n),
          };
        });
        sqlite.exec("COMMIT");
        return results;
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    },
  };
  return { sqlite, db };
}
test("separate API entitlement and company-wide allowance hold across concurrent keys and renewal", async () => {
  const { sqlite, db } = fixture();
  const now = Date.now();
  try {
    await ensureApiRevenue(db);
    const missing = await reserveApiUsage(db, "one", true, now);
    assert.equal(missing.ok, false);
    if (!missing.ok) assert.equal(missing.status, 402);
    const preview = await reserveApiUsage(db, "preview", false, now);
    assert.ok(preview.ok);
    assert.equal((await apiRevenueStatus(db, "preview", false, now)).used, 1);
    await db.run(
      "INSERT INTO ApiAccessSubscription(organizationId,subscriptionId,status,periodStart,periodEnd,requestAllowance,priceId,monthlyAmountCents) VALUES ('one','sub_fixture','active',?,?,5,'price_fixture',12345)",
      now - 1000,
      now + 100000,
    );
    const requests = await Promise.all(
      Array.from({ length: 12 }, () => reserveApiUsage(db, "one", true, now)),
    );
    assert.equal(requests.filter((r) => r.ok).length, 5);
    assert.equal((await apiRevenueStatus(db, "one", true, now)).used, 5);
    const first = requests.find((r) => r.ok)!;
    assert.ok(first.ok);
    if (first.ok)
      await Promise.all([
        finalizeApiUsage(db, first.id, false),
        finalizeApiUsage(db, first.id, false),
      ]);
    assert.equal((await apiRevenueStatus(db, "one", true, now)).used, 4);
    const response = await withApiUsage(db, "one", true, async () =>
      Response.json({ error: "fixture failure" }, { status: 503 }),
    );
    assert.equal(response.status, 503);
    assert.equal((await apiRevenueStatus(db, "one", true, now)).used, 4);
    await assert.rejects(() =>
      withApiUsage(db, "one", true, async () => {
        throw new Error("fixture");
      }),
    );
    assert.equal((await apiRevenueStatus(db, "one", true, now)).used, 4);
    await withApiUsage(db, "one", true, async () =>
      Response.json({ ok: true }),
    );
    assert.equal((await apiRevenueStatus(db, "one", true, now)).used, 5);
    assert.equal(
      (
        await withApiUsage(db, "one", true, async () =>
          Response.json({ ok: true }),
        )
      ).status,
      429,
    );
    await db.run(
      "UPDATE ApiAccessSubscription SET status='past_due' WHERE organizationId='one'",
    );
    assert.equal(
      (
        await withApiUsage(db, "one", true, async () =>
          Response.json({ ok: true }),
        )
      ).status,
      402,
    );
    await db.run(
      "UPDATE ApiAccessSubscription SET status='active',periodStart=?,periodEnd=? WHERE organizationId='one'",
      now + 200000,
      now + 300000,
    );
    assert.equal((await reserveApiUsage(db, "one", true, now)).ok, false);
    assert.equal(
      (await reserveApiUsage(db, "one", true, now + 200001)).ok,
      true,
    );
    assert.equal(
      (await apiRevenueStatus(db, "one", true, now + 200001)).used,
      1,
    );
    assert.equal((await apiRevenueStatus(db, "other", false, now)).used, 0);
    assert.equal(
      (await reserveApiUsage(db, "one", true, now + 300000)).ok,
      false,
    );
    await db.run("UPDATE ApiUsageReservation SET expiresAt=0");
    await purgeApiUsageReservations(db, now);
    assert.equal(
      sqlite.prepare("SELECT COUNT(*) n FROM ApiUsageReservation").get()!.n,
      0,
    );
    assert.equal((await apiRevenueStatus(db, "preview", false, now)).used, 1);
  } finally {
    sqlite.close();
  }
});
test("meter reservations and quota counters roll back together on database failure", async () => {
  const { sqlite, db } = fixture();
  try {
    await ensureApiRevenue(db);
    sqlite.exec(
      "CREATE TRIGGER fail_reservation BEFORE INSERT ON ApiUsageReservation BEGIN SELECT RAISE(ABORT,'fixture'); END",
    );
    await assert.rejects(() => reserveApiUsage(db, "rollback", false));
    assert.equal(
      sqlite.prepare("SELECT COUNT(*) n FROM ApiUsagePeriod").get()!.n,
      0,
    );
  } finally {
    sqlite.close();
  }
});

test("accepted client errors count but thrown server failures are released", async () => {
  const { sqlite, db } = fixture();
  try {
    await withApiUsage(db, "errors", false, async () =>
      Response.json({ error: "invalid" }, { status: 400 }),
    );
    await assert.rejects(() =>
      withApiUsage(db, "errors", false, async () => {
        throw Object.assign(new Error("invalid"), { status: 400 });
      }),
    );
    await assert.rejects(() =>
      withApiUsage(db, "errors", false, async () => {
        throw new Error("server");
      }),
    );
    assert.equal((await apiRevenueStatus(db, "errors", false)).used, 2);
  } finally {
    sqlite.close();
  }
});
