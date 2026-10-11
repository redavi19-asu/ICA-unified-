import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { handleStripeSnapshotEvent } from '../src/lib/stripe-billing';

test('subscription lifecycle updates only the matching organization and repeats safely', async () => {
  const sqlite = new DatabaseSync(':memory:');
  type Statement = {
    bind: (...args: SQLInputValue[]) => Statement;
    run: () => Promise<{ meta: { changes: number | bigint } }>;
    raw: () => Promise<unknown[]>;
  };
  const wrap = (sql: string, values: SQLInputValue[] = []): Statement => ({
    bind: (...args: SQLInputValue[]) => wrap(sql, args),
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

  sqlite.exec(`CREATE TABLE Organization (id TEXT PRIMARY KEY, name TEXT NOT NULL, slug TEXT NOT NULL, plan TEXT, status TEXT, trialEndsAt INTEGER, createdAt INTEGER, updatedAt INTEGER);
    INSERT INTO Organization VALUES ('org-qc','QC','qc','professional','ACTIVE',NULL,0,0),('other','Other','other','professional','ACTIVE',NULL,0,0);`);
  try {
    for (const [status, expected] of [['trialing','TRIAL'],['active','ACTIVE'],['past_due','SUSPENDED'],['unpaid','SUSPENDED'],['active','ACTIVE'],['canceled','CANCELLED']]) {
      const event = { type:'customer.subscription.updated', data:{object:{id:'sub_qc',customer:'cus_qc',status,metadata:{organizationId:'org-qc'}}}};
      await handleStripeSnapshotEvent(event);
      await handleStripeSnapshotEvent(event);
      assert.equal(sqlite.prepare("SELECT status FROM Organization WHERE id='org-qc'").get()?.status,expected);
      assert.equal(sqlite.prepare("SELECT status FROM Organization WHERE id='other'").get()?.status,'ACTIVE');
      assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM OrganizationBillingProfile').get()?.n,1);
    }
  } finally { delete context[contextKey]; sqlite.close(); }
});
