import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { decodeJwt } from 'jose';
import { AsyncLocalStorage } from 'node:async_hooks';
Reflect.set(globalThis, 'AsyncLocalStorage', AsyncLocalStorage);

test('master workspace sessions require existing available membership and an unambiguous company', async () => {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(
    readFileSync(
      new URL("./fixtures/application-schema.sql", import.meta.url),
      "utf8",
    ),
  );

  type FixtureStatement = {
    sql: string;
    values: SQLInputValue[];
    bind: (...args: SQLInputValue[]) => FixtureStatement;
    run: () => Promise<unknown>;
    raw: (options?: {columnNames?: boolean}) => Promise<unknown>;
    all: () => Promise<unknown>;
    first: () => Promise<unknown>;
  };
  const wrap = (sql: string, values: SQLInputValue[] = []): FixtureStatement => ({
    sql,
    values,
    bind: (...args: SQLInputValue[]) => wrap(sql, args),
    async run() {
      return {
        success: true,
        meta: { changes: sqlite.prepare(sql).run(...values).changes },
      };
    },
    async raw(options: {columnNames?: boolean} = {}) {
      const s = sqlite.prepare(sql);
      const columns = s.columns().map((c) => c.name);
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
  const db = {
    prepare: (sql: string) => wrap(sql),
    async batch(statements: FixtureStatement[]) {
      sqlite.exec("BEGIN");
      try {
        const results = statements.map((statement) => ({
          success: true,
          results: sqlite.prepare(statement.sql).all(...statement.values),
        }));
        sqlite.exec("COMMIT");
        return results;
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    },
  };
  const contextKey = Symbol.for("__cloudflare-context__");
  Reflect.set(globalThis, contextKey, { env: { DB: db } });

  const { createMasterWorkspaceSession, WorkspaceSelectionRequired } = await import('../src/lib/master-workspace');
  sqlite.exec(`
    INSERT INTO User (id,email,name,passwordHash,updatedAt) VALUES ('owner','owner@example.com','Owner','unused',CURRENT_TIMESTAMP);
    INSERT INTO Organization (id,name,slug,status,plan,updatedAt) VALUES ('a','Internal','ica-master','ACTIVE','internal',CURRENT_TIMESTAMP),('b','Customer','customer','ACTIVE','trial',CURRENT_TIMESTAMP);
    INSERT INTO Membership (id,userId,organizationId,role) VALUES ('ma','owner','a','OWNER');
  `);
  const token = await createMasterWorkspaceSession(' OWNER@EXAMPLE.COM ');
  assert.ok(token);
  assert.equal(decodeJwt(token).organizationId, 'a');
  assert.equal(decodeJwt(token).role, 'OWNER');
  assert.equal(await createMasterWorkspaceSession('unknown@example.com'), null);
  assert.equal(await createMasterWorkspaceSession('owner@example.com','customer'), null);
  sqlite.exec("INSERT INTO Membership (id,userId,organizationId,role) VALUES ('mb','owner','b','MEMBER')");
  await assert.rejects(createMasterWorkspaceSession('owner@example.com'), WorkspaceSelectionRequired);
  const selected = await createMasterWorkspaceSession('owner@example.com','customer');
  assert.equal(decodeJwt(selected!).role, 'MEMBER');
  sqlite.exec("UPDATE Membership SET status='SUSPENDED' WHERE id='mb'");
  assert.equal(await createMasterWorkspaceSession('owner@example.com','customer'), null);
  for (const status of ['SUSPENDED','CANCELLED']) {
    sqlite.prepare("UPDATE Organization SET status=? WHERE id='a'").run(status);
    assert.equal(await createMasterWorkspaceSession('owner@example.com'), null);
  }
  // Exercise the actual control-plane return route and its cookie boundary.
  sqlite.exec("UPDATE Organization SET status='ACTIVE' WHERE id='a'");
  const { ensureUnifiedRuntimeSchema } = await import('../src/lib/runtime-schema');
  await ensureUnifiedRuntimeSchema();
  const { prisma } = await import('../src/lib/prisma');
  const admin = await prisma.platformAdmin.create({ data: {
    email: 'owner@example.com', name: 'Owner', passwordHash: 'unused', role: 'MASTER', active: true,
  } });
  const { createPlatformSession, platformSessionCookie } = await import('../src/lib/platform-auth');
  const adminToken = await createPlatformSession({ platformAdminId: admin.id, role: 'MASTER' });
  const require = createRequire(import.meta.url);
  require('next/headers').cookies = async () => ({get: (name: string) =>
    name === platformSessionCookie.name ? {value: adminToken} : undefined});
  const { POST } = await import('../src/app/api/platform/workspace/route');
  const endpoint = 'https://unified.icomputeranything.com/api/platform/workspace';
  const denied = await POST(new Request(endpoint, {method: 'POST', headers: {origin: 'https://other.example'}}));
  assert.equal(denied.status, 403);
  const response = await POST(new Request(endpoint, {method: 'POST', headers: {origin: new URL(endpoint).origin}}));
  assert.equal(response.status, 303);
  assert.equal(response.headers.get('location'), 'https://unified.icomputeranything.com/workspace');
  const cookie = response.cookies.get('ica_unified_session');
  assert.ok(cookie?.value);
  assert.equal(decodeJwt(cookie.value).organizationId, 'a');
  assert.ok(response.headers.get('set-cookie')?.includes('HttpOnly'));
  // The OAuth callback must retain both sessions and choose the workspace.
  const social = await import('../src/lib/social-auth');
  const socialModule = require.cache[require.resolve('../src/lib/social-auth')];
  const originalExports = socialModule!.exports;
  let callbackResult: object = {kind: 'platform', token: adminToken, workspaceToken: token};
  socialModule!.exports = {...social, finishSocialCallback: async () => callbackResult};
  try {
    const callback = await import('../src/app/api/auth/social/[provider]/callback/route');
    const callbackRequest = new Request('https://unified.icomputeranything.com/api/auth/social/google/callback?code=private-code');
    const result = await callback.GET(callbackRequest, {params: Promise.resolve({provider: 'google'})});
    assert.equal(result.status, 303);
    assert.equal(result.headers.get('location'), 'https://unified.icomputeranything.com/workspace');
    assert.equal(result.cookies.get('ica_unified_session')?.value, token);
    assert.equal(result.cookies.get(platformSessionCookie.name)?.value, adminToken);
    callbackResult = {kind: 'platform', token: adminToken, workspaceToken: null};
    const platformOnly = await callback.GET(callbackRequest, {params: Promise.resolve({provider: 'google'})});
    assert.equal(platformOnly.headers.get('location'), 'https://unified.icomputeranything.com/platform');
    assert.equal(platformOnly.cookies.get('ica_unified_session')?.value, '');
  } finally {
    socialModule!.exports = originalExports;
  }
  sqlite.close();
});
