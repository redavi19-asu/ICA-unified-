import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { AsyncLocalStorage } from 'node:async_hooks';
import { createRequire } from 'node:module';

(globalThis as unknown as { AsyncLocalStorage: typeof AsyncLocalStorage }).AsyncLocalStorage = AsyncLocalStorage;

test('deletion review stays private, coalesces requests and previews ownership without deleting accounts', async () => {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(readFileSync(new URL('./fixtures/application-schema.sql', import.meta.url), 'utf8'));
  type Value = string | number | null;
  const wrap = (sql: string, values: Value[] = []) => ({
    bind(...params: Value[]) { return wrap(sql, params); },
    async run() { return { success: true, meta: { changes: sqlite.prepare(sql).run(...values).changes } }; },
    async raw(options: { columnNames?: boolean } = {}) {
      const s = sqlite.prepare(sql); const columns = s.columns().map(column => column.name);
      s.setReturnArrays(true); const rows = s.all(...values);
      return options.columnNames ? [columns, ...rows] : rows;
    },
    async all() { return { success: true, results: sqlite.prepare(sql).all(...values) }; },
    async first() { return sqlite.prepare(sql).get(...values) || null; },
  });
  const context = globalThis as unknown as Record<symbol, unknown>;
  const contextKey = Symbol.for('__cloudflare-context__');
  context[contextKey] = { env: { DB: { prepare: (sql: string) => wrap(sql) } } };
  const { prisma } = await import('../src/lib/prisma');
  const { ensureUnifiedRuntimeSchema } = await import('../src/lib/runtime-schema');
  await ensureUnifiedRuntimeSchema();
  const require = createRequire(import.meta.url);
  type CookieReader = { get(name: string): { value: string } | undefined };
  const storage = new AsyncLocalStorage<{ cookies: CookieReader }>();
  require('next/headers').cookies = async () => storage.getStore()!.cookies;
  const { RequestCookies } = require('next/dist/server/web/spec-extension/cookies');
  const { NextRequest } = await import('next/server');
  const { createSession } = await import('../src/lib/auth');
  const { createPlatformSession } = await import('../src/lib/platform-auth');
  const { readMobileSession } = await import('../src/lib/mobile-auth');
  const customer = await import('../src/app/api/account/deletion-request/route');
  const review = await import('../src/app/api/platform/deletion-requests/[id]/route');
  type Handler = (request: Request, props: { params: Promise<{ id: string }> }) => Promise<Response>;
  let cookie = '';
  async function call(handler: Handler, id = '', body?: unknown, bearer?: string) {
    const request = new NextRequest('https://example.test/api/review', {
      method: body === undefined ? 'GET' : 'POST', headers: { 'content-type': 'application/json', cookie,
        ...(bearer ? { authorization: `Bearer ${bearer}` } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return storage.run({ cookies: new RequestCookies(request.headers) }, () => handler(request, { params: Promise.resolve({ id }) }));
  }
  try {
    const org = await prisma.organization.create({ data: { name: 'Deletion fixture', slug: 'deletion-fixture', status: 'ACTIVE', plan: 'professional' } });
    const foreign = await prisma.organization.create({ data: { name: 'Other fixture', slug: 'other-fixture', status: 'ACTIVE', plan: 'professional' } });
    const owner = await prisma.user.create({ data: { email: 'owner@deletion.example', name: 'Fixture owner', passwordHash: 'fixture-only' } });
    const member = await prisma.user.create({ data: { email: 'member@deletion.example', name: 'Fixture member', passwordHash: 'fixture-only' } });
    await prisma.membership.create({ data: { organizationId: org.id, userId: owner.id, role: 'OWNER', status: 'ACTIVE' } });
    await prisma.membership.create({ data: { organizationId: org.id, userId: member.id, role: 'MEMBER', status: 'ACTIVE' } });
    await prisma.membership.create({ data: { organizationId: foreign.id, userId: member.id, role: 'MEMBER', status: 'ACTIVE' } });
    const ownerToken = await createSession({ userId: owner.id, organizationId: org.id, organizationSlug: org.slug, role: 'OWNER' });
    const memberToken = await createSession({ userId: member.id, organizationId: org.id, organizationSlug: org.slug, role: 'MEMBER' });
    cookie = `ica_unified_session=${ownerToken}`;
    const responses = await Promise.all([
      call(customer.POST, '', { scope: 'ACCOUNT', confirmation: 'DELETE' }),
      call(customer.POST, '', { scope: 'ACCOUNT', confirmation: 'DELETE' }),
    ]);
    const ids = await Promise.all(responses.map(async response => { assert.ok([200,201].includes(response.status)); return (await response.json()).requestId; }));
    assert.equal(ids[0], ids[1]);
    assert.equal((await prisma.$queryRawUnsafe<Array<{ n: number }>>('SELECT COUNT(*) AS n FROM AccountDeletionRequest'))[0].n, 1);
    assert.equal((await call(review.GET, ids[0])).status, 403); // Organization owner is not platform admin.
    const support = await prisma.platformAdmin.create({ data: { email: 'support@deletion.example', name: 'Support fixture', passwordHash: 'fixture-only', role: 'SUPPORT' } });
    cookie = `ica_unified_platform_session=${await createPlatformSession({ platformAdminId: support.id, role: 'SUPPORT' })}`;
    assert.equal((await call(review.GET, ids[0])).status, 403);
    assert.equal((await call(review.POST, ids[0], { status: 'UNDER_REVIEW', message: 'Unauthorized update', expectedCompletionAt: null })).status, 403);
    const admin = await prisma.platformAdmin.create({ data: { email: 'admin@deletion.example', name: 'Admin fixture', passwordHash: 'fixture-only', role: 'PLATFORM_ADMIN' } });
    cookie = `ica_unified_platform_session=${await createPlatformSession({ platformAdminId: admin.id, role: 'PLATFORM_ADMIN' })}`;
    const previewResponse = await call(review.GET, ids[0]); assert.equal(previewResponse.status, 200);
    const preview = await previewResponse.json(); assert.deepEqual(preview.ownershipTransferRequired, ['Deletion fixture']);
    assert.equal((await call(review.POST, ids[0], { status: 'COMPLETED', message: 'Cannot fake completion', expectedCompletionAt: null })).status, 400);
    const future = new Date(Date.now()+86400000).toISOString();
    assert.equal((await call(review.POST, ids[0], { status: 'UNDER_REVIEW', message: 'We are reviewing ownership and your request.', expectedCompletionAt: future })).status, 200);
    cookie = `ica_unified_session=${ownerToken}`;
    const status = (await (await call(customer.GET)).json()).requests[0];
    assert.equal(status.status, 'UNDER_REVIEW'); assert.equal(status.expectedCompletionAt, future);
    assert.match(status.message, /reviewing ownership/);
    assert.equal((await (await call(customer.POST, '', { scope: 'ACCOUNT', confirmation: 'DELETE' })).json()).requestId, ids[0]);
    cookie = `ica_unified_session=${memberToken}`;
    assert.equal((await (await call(customer.GET)).json()).requests.length, 0);
    assert.equal((await call(customer.POST, '', { scope: 'ORGANIZATION', confirmation: 'DELETE' })).status, 403);
    await prisma.organization.update({ where: { id: org.id }, data: { status: 'CANCELLED' } });
    const mobileRequest = new Request('https://example.test/privacy', { headers: { authorization: `Bearer ${memberToken}` } });
    assert.equal(await readMobileSession(mobileRequest), null);
    assert.ok(await readMobileSession(mobileRequest, { allowUnentitled: true }));
    assert.equal((await call(customer.POST, '', { scope: 'ACCOUNT', confirmation: 'DELETE' }, memberToken)).status, 201);
    cookie = `ica_unified_platform_session=${await createPlatformSession({ platformAdminId: admin.id, role: 'PLATFORM_ADMIN' })}`;
    await prisma.$executeRawUnsafe("UPDATE AccountDeletionRequest SET status='COMPLETED' WHERE id=?", ids[0]);
    assert.equal((await call(review.POST, ids[0], { status: 'NEEDS_INFORMATION', message: 'Must not reopen a resolved request.', expectedCompletionAt: null })).status, 409);
    assert.equal(await prisma.user.count(), 2);
    assert.equal(await prisma.membership.count(), 3);
    await prisma.platformAdmin.update({ where: { id: admin.id }, data: { active: false } });
    assert.equal((await call(review.GET, ids[0])).status, 403);
  } finally { await prisma.$disconnect(); delete context[contextKey]; sqlite.close(); }
});
