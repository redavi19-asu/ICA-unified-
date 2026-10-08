import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { consumeSecurityToken } from '../src/lib/security';
import { unifiedFreeAccess } from '../src/lib/master-free-access';
import { REQUIRED_APPLICATION_TABLES } from '../src/lib/runtime-schema';
import { GET } from '../src/app/api/health/route';

const context = globalThis as unknown as Record<symbol, unknown>;
const contextKey = Symbol.for('__cloudflare-context__');

test('only one concurrent request consumes a password-reset token', async () => {
  const sqlite = new DatabaseSync(':memory:');
  const database = {
    prepare(sql: string) {
      let values: (string | number)[] = [];
      return {
        bind(...params: (string | number)[]) { values = params; return this; },
        async first() { return sqlite.prepare(sql).get(...values); },
        async run() { const result = sqlite.prepare(sql).run(...values); return { success: true, meta: { changes: result.changes } }; },
      };
    },
  };
  context[contextKey] = { env: { DB: database } };
  try {
    // Bootstrap through the actual security helper, then insert a reset token.
    assert.equal(await consumeSecurityToken('missing', 'password_reset'), null);
    const tokenHash = createHash('sha256').update('one-time-reset').digest('hex');
    sqlite.prepare('INSERT INTO SecurityToken (id,userId,purpose,tokenHash,expiresAt) VALUES (?,?,?,?,?)')
      .run('token-1', 'user-1', 'password_reset', tokenHash, Date.now() + 60_000);
    const results = await Promise.all([
      consumeSecurityToken('one-time-reset', 'password_reset'),
      consumeSecurityToken('one-time-reset', 'password_reset'),
    ]);
    assert.equal(results.filter(result => result === 'user-1').length, 1);
    assert.equal(results.filter(result => result === null).length, 1);
    assert.equal(await consumeSecurityToken('one-time-reset', 'password_reset'), null);
    sqlite.prepare('INSERT INTO SecurityToken (id,userId,purpose,tokenHash,expiresAt) VALUES (?,?,?,?,?)')
      .run('expired', 'user-1', 'password_reset', createHash('sha256').update('expired').digest('hex'), Date.now() - 1);
    assert.equal(await consumeSecurityToken('expired', 'password_reset'), null);
  } finally { delete context[contextKey]; sqlite.close(); }
});

test('an unavailable Master grant database fails closed without rejecting the request', async () => {
  context[contextKey] = { env: { ICA_DB: { prepare() { return { bind() { return { async first() { throw new Error('database unavailable'); } }; } }; } } } };
  const originalError = console.error;
  console.error = () => {};
  try { assert.equal(await unifiedFreeAccess('member@example.com'), null); }
  finally { console.error = originalError; delete context[contextKey]; }
});

test('public health checks inspect readiness without deleting customer accounts', async () => {
  let queries = 0;
  context[contextKey] = { env: { DB: {
    prepare(sql: string) {
      assert.match(sql, /^SELECT name FROM sqlite_master/);
      queries++;
      return { bind() { return { async all() { return { results: REQUIRED_APPLICATION_TABLES.map(name => ({ name })) }; } }; } };
    },
  } } };
  try {
    const response = await GET();
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true, service: 'ICA Unified' });
    assert.equal(queries, 1);
  } finally { delete context[contextKey]; }
});
