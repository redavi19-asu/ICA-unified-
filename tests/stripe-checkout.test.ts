import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { createProfessionalCheckout } from '../src/lib/stripe-billing';

test('checkout retries reuse a session and cancellation starts a new subscription lifecycle', async () => {
  const sqlite = new DatabaseSync(':memory:');
  const wrap = (sql: string, values: any[] = []): any => ({
    bind: (...args: any[]) => wrap(sql, args),
    async run() { return { meta: { changes: sqlite.prepare(sql).run(...values).changes } }; },
    async raw() {
      const statement = sqlite.prepare(sql);
      const columns = statement.columns().map(column => column.name);
      statement.setReturnArrays(true);
      return [columns, ...statement.all(...values)];
    },
  });
  const context = globalThis as unknown as Record<symbol, unknown>;
  const contextKey = Symbol.for('__cloudflare-context__');
  context[contextKey] = { env: { DB: { prepare: (sql: string) => wrap(sql) } } };
  const previousSecret = process.env.STRIPE_SECRET_KEY;
  const previousPrice = process.env.STRIPE_PROFESSIONAL_PRICE_ID;
  const previousFetch = globalThis.fetch;
  const previousNow = Date.now;
  process.env.STRIPE_SECRET_KEY = 'rk_test_synthetic_local_only';
  process.env.STRIPE_PROFESSIONAL_PRICE_ID = 'price_synthetic';
  const sessions = new Map<string, { body: string; id: string }>();
  let requests = 0;
  globalThis.fetch = async (_url, init) => {
    requests++;
    const key = new Headers(init?.headers).get('Idempotency-Key') || '';
    const body = String(init?.body);
    const existing = sessions.get(key);
    if (existing && existing.body !== body) {
      return Response.json({ error: { message: 'Idempotency parameters changed' } }, { status: 400 });
    }
    const session = existing || { body, id: `cs_test_${sessions.size + 1}` };
    sessions.set(key, session);
    return Response.json({ id: session.id, url: `https://checkout.stripe.com/${session.id}` });
  };
  const input = { organizationId: 'org-qc', organizationName: 'Synthetic QC', ownerEmail: 'qc@example.com', origin: 'https://sandbox.example.com' };
  try {
    const first = await createProfessionalCheckout(input);
    Date.now = () => previousNow() + 60_000;
    assert.equal((await createProfessionalCheckout(input)).id, first.id);
    sqlite.prepare("UPDATE OrganizationBillingProfile SET providerSubscriptionId='sub_old', subscriptionStatus='canceled' WHERE organizationId=?").run(input.organizationId);
    const restarted = await createProfessionalCheckout(input);
    assert.notEqual(restarted.id, first.id);
    assert.equal((await createProfessionalCheckout(input)).id, restarted.id);
    sqlite.prepare("UPDATE OrganizationBillingProfile SET subscriptionStatus='trialing' WHERE organizationId=?").run(input.organizationId);
    const before = requests;
    await assert.rejects(createProfessionalCheckout(input), /SUBSCRIPTION_ALREADY_EXISTS/);
    assert.equal(requests, before);
  } finally {
    globalThis.fetch = previousFetch;
    Date.now = previousNow;
    if (previousSecret === undefined) delete process.env.STRIPE_SECRET_KEY; else process.env.STRIPE_SECRET_KEY = previousSecret;
    if (previousPrice === undefined) delete process.env.STRIPE_PROFESSIONAL_PRICE_ID; else process.env.STRIPE_PROFESSIONAL_PRICE_ID = previousPrice;
    delete context[contextKey];
    sqlite.close();
  }
});
