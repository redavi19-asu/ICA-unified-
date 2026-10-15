import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { AsyncLocalStorage } from "node:async_hooks";
(
  globalThis as unknown as { AsyncLocalStorage: typeof AsyncLocalStorage }
).AsyncLocalStorage = AsyncLocalStorage;
test("API checkout and current subscription reconciliation stay separate from software billing", async () => {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(
    readFileSync(
      new URL("./fixtures/application-schema.sql", import.meta.url),
      "utf8",
    ),
  );
  type Value = string | number | null;
  const wrap = (sql: string, values: Value[] = []) => ({
    sql,
    values,
    bind(...params: Value[]) {
      return wrap(sql, params);
    },
    async run() {
      return {
        success: true,
        meta: { changes: sqlite.prepare(sql).run(...values).changes },
      };
    },
    async raw(options: { columnNames?: boolean } = {}) {
      const s = sqlite.prepare(sql);
      const columns = s.columns().map((column) => column.name);
      s.setReturnArrays(true);
      const rows = s.all(...values);
      return options.columnNames ? [columns, ...rows] : rows;
    },
    async all() {
      return { success: true, results: sqlite.prepare(sql).all(...values) };
    },
    async first() {
      return sqlite.prepare(sql).get(...values) || null;
    },
  });
  const context = globalThis as unknown as Record<symbol, unknown>;
  const contextKey = Symbol.for("__cloudflare-context__");
  context[contextKey] = {
    env: {
      DB: {
        prepare: (sql: string) => wrap(sql),
        async batch(statements: Array<ReturnType<typeof wrap>>) {
          sqlite.exec("BEGIN IMMEDIATE");
          try {
            const results = statements.map((statement) => {
              const rows = sqlite
                .prepare(statement.sql)
                .all(...statement.values);
              const changes = Number(
                sqlite.prepare("SELECT changes() AS n").get()!.n,
              );
              return { success: true, results: rows, meta: { changes } };
            });
            sqlite.exec("COMMIT");
            return results;
          } catch (error) {
            sqlite.exec("ROLLBACK");
            throw error;
          }
        },
      },
    },
  };
  sqlite.exec("PRAGMA foreign_keys=ON");
  const { prisma } = await import("../src/lib/prisma");
  const { ensureUnifiedRuntimeSchema } =
    await import("../src/lib/runtime-schema");
  await ensureUnifiedRuntimeSchema();

  const envNames = [
    "API_PAID_ACCESS_REQUIRED",
    "STRIPE_API_PRICE_ID",
    "API_MONTHLY_AMOUNT_CENTS",
    "API_MONTHLY_REQUEST_ALLOWANCE",
    "STRIPE_SECRET_KEY",
    "STRIPE_WEBHOOK_SECRET",
  ];
  const previous = Object.fromEntries(
    envNames.map((name) => [name, process.env[name]]),
  );
  Object.assign(process.env, {
    API_PAID_ACCESS_REQUIRED: "true",
    STRIPE_API_PRICE_ID: "price_api_fixture",
    API_MONTHLY_AMOUNT_CENTS: "12345",
    API_MONTHLY_REQUEST_ALLOWANCE: "5",
    STRIPE_SECRET_KEY: "rk_test_fixture_only",
    STRIPE_WEBHOOK_SECRET: "whsec_fixture_only",
  });
  const originalFetch = globalThis.fetch;
  const now = Math.floor(Date.now() / 1000);
  const price = {
    id: "price_api_fixture",
    active: true,
    currency: "usd",
    unit_amount: 12345,
    recurring: { interval: "month", interval_count: 1 },
  };
  let state = {
    id: "sub_api_fixture",
    customer: "cus_fixture",
    status: "active",
    metadata: { product: "ica-unified-api" },
    items: {
      data: [
        {
          id: "item_fixture",
          quantity: 1,
          price,
          current_period_start: now - 100,
          current_period_end: now + 30000,
        },
      ],
    },
  };
  let purchased = false;
  let checkoutBody: URLSearchParams | null = null;
  let cancelled = false;
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    let body: unknown = {};
    if (url.includes("/v1/prices/")) body = price;
    else if (url.includes("/v1/subscriptions/sub_api_fixture")) {
      if (init?.method === "POST") {
        cancelled = true;
        body = { ...state, cancel_at_period_end: true };
      } else body = state;
    } else if (url.includes("/v1/subscriptions"))
      body = {
        data: purchased
          ? [state]
          : [
              {
                id: "sub_base_fixture",
                status: "active",
                metadata: {},
                items: { data: [{ price: { id: "price_base_fixture" } }] },
              },
            ],
        has_more: false,
      };
    else if (url.includes("/v1/checkout/sessions")) {
      if (init?.method === "POST") {
        checkoutBody = new URLSearchParams(String(init.body));
        body = {
          id: "cs_api_fixture",
          url: "https://checkout.stripe.com/fixture",
        };
      } else body = { data: [], has_more: false };
    } else throw new Error("Unexpected fixture network request");
    return Response.json(body);
  };
  try {
    const { ensureBillingProfile } =
      await import("../src/lib/organization-ops");
    const {
      createApiCheckout,
      handleApiRevenueEvent,
      cancelApiRenewal,
      apiPlanConfiguration,
    } = await import("../src/lib/api-revenue-stripe");
    const { apiRevenueDatabase } =
      await import("../src/lib/api-revenue-database");
    const { apiRevenueStatus } = await import("../src/lib/api-revenue");
    const org = await prisma.organization.create({
      data: {
        name: "API billing fixture",
        slug: "api-billing-fixture",
        plan: "professional",
        status: "ACTIVE",
      },
    });
    const other = await prisma.organization.create({
      data: {
        name: "Other billing fixture",
        slug: "api-billing-other",
        plan: "professional",
        status: "ACTIVE",
      },
    });
    await ensureBillingProfile(org.id);
    await prisma.$executeRawUnsafe(
      "UPDATE OrganizationBillingProfile SET providerCustomerId='cus_fixture',providerSubscriptionId='sub_base_fixture',subscriptionStatus='active' WHERE organizationId=?",
      org.id,
    );
    assert.equal(apiPlanConfiguration().ready, true);
    assert.equal(
      await createApiCheckout({
        organizationId: org.id,
        organizationName: org.name,
        email: "fixture@api.example",
        origin: "https://example.test",
      }),
      "https://checkout.stripe.com/fixture",
    );
    const submitted = checkoutBody as unknown as URLSearchParams;
    assert.equal(submitted.get("line_items[0][price]"), "price_api_fixture");
    assert.equal(submitted.get("customer"), "cus_fixture");
    assert.equal(submitted.get("metadata[product]"), "ica-unified-api");
    assert.equal(submitted.has("subscription_data[trial_period_days]"), false);
    assert.equal(submitted.has("payment_method_types[0]"), false);
    assert.equal(
      (await apiRevenueStatus(apiRevenueDatabase(), org.id, true)).entitled,
      false,
    );
    assert.equal(
      await handleApiRevenueEvent({
        type: "checkout.session.completed",
        data: {
          object: {
            id: "cs_fixture",
            mode: "subscription",
            payment_status: "unpaid",
            subscription: "sub_api_fixture",
            metadata: { product: "ica-unified-api" },
          },
        },
      }),
      true,
    );
    assert.equal(
      (await apiRevenueStatus(apiRevenueDatabase(), org.id, true)).entitled,
      false,
    );
    purchased = true;
    await handleApiRevenueEvent({
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_fixture",
          mode: "subscription",
          payment_status: "paid",
          subscription: "sub_api_fixture",
          metadata: { product: "ica-unified-api" },
        },
      },
    });
    assert.equal(
      (await apiRevenueStatus(apiRevenueDatabase(), org.id, true)).entitled,
      true,
    );
    await assert.rejects(
      () =>
        createApiCheckout({
          organizationId: org.id,
          organizationName: org.name,
          email: "fixture@api.example",
          origin: "https://example.test",
        }),
      /API_SUBSCRIPTION_EXISTS/,
    );
    state = { ...state, status: "past_due" };
    await handleApiRevenueEvent({
      type: "customer.subscription.updated",
      data: { object: { ...state, status: "active" } },
    });
    assert.equal(
      (await apiRevenueStatus(apiRevenueDatabase(), org.id, true)).entitled,
      false,
    );
    assert.equal(
      (await prisma.organization.findUniqueOrThrow({ where: { id: org.id } }))
        .status,
      "ACTIVE",
    );
    assert.equal(
      await handleApiRevenueEvent({
        type: "customer.subscription.updated",
        data: { object: { id: "sub_other", metadata: {} } },
      }),
      false,
    );
    assert.equal(
      (await apiRevenueStatus(apiRevenueDatabase(), other.id, true)).entitled,
      false,
    );
    state = { ...state, status: "active" };
    await handleApiRevenueEvent({
      type: "invoice.paid",
      data: {
        object: {
          parent: { subscription_details: { subscription: "sub_api_fixture" } },
        },
      },
    });
    const savedAllowance = (
      await apiRevenueStatus(apiRevenueDatabase(), org.id, true)
    ).allowance;
    process.env.API_MONTHLY_REQUEST_ALLOWANCE = "999";
    await handleApiRevenueEvent({
      type: "customer.subscription.updated",
      data: { object: state },
    });
    assert.equal(
      (await apiRevenueStatus(apiRevenueDatabase(), org.id, true)).allowance,
      savedAllowance,
    );
    process.env.API_PAID_ACCESS_REQUIRED = "false";
    await cancelApiRenewal(org.id);
    assert.ok(cancelled);
    state = { ...state, status: "canceled" };
    await handleApiRevenueEvent({
      type: "customer.subscription.deleted",
      data: { object: state },
    });
    assert.equal(
      (await apiRevenueStatus(apiRevenueDatabase(), org.id, true)).entitled,
      false,
    );
    assert.equal(
      (await prisma.organization.findUniqueOrThrow({ where: { id: org.id } }))
        .status,
      "ACTIVE",
    );
    process.env.API_PAID_ACCESS_REQUIRED = "false";
    assert.equal(apiPlanConfiguration().ready, false);
  } finally {
    globalThis.fetch = originalFetch;
    for (const name of envNames) {
      if (previous[name] === undefined) delete process.env[name];
      else process.env[name] = previous[name];
    }
    await prisma.$disconnect();
    delete context[contextKey];
    sqlite.close();
  }
});
