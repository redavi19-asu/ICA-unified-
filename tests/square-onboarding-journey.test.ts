import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { randomBytes } from 'node:crypto';
import {
  beginSquareOnboarding, finishSquareOnboarding, getSquareMerchantStatus,
  listSquareMerchantLocations, selectSquareMerchantLocation,
} from '../src/lib/square-connect';

test('Square onboarding is single-use, organization-bound and encrypts tokens at rest', async () => {
  const sqlite = new DatabaseSync(':memory:');
  type Statement = {
    bind: (...args: SQLInputValue[]) => Statement;
    run: () => Promise<{ success: boolean; meta: { changes: number | bigint } }>;
    raw: (options?: { columnNames?: boolean }) => Promise<unknown[]>;
  };
  const wrap = (sql: string, values: SQLInputValue[] = []): Statement => ({
    bind: (...args) => wrap(sql, args),
    async run() {
      return { success: true, meta: { changes: sqlite.prepare(sql).run(...values).changes } };
    },
    async raw(options = {}) {
      const statement = sqlite.prepare(sql);
      const columns = statement.columns().map((column) => column.name);
      statement.setReturnArrays(true);
      const rows = statement.all(...values);
      return options.columnNames ? [columns, ...rows] : rows;
    },
  });

  const key = Symbol.for('__cloudflare-context__');
  const globals = globalThis as unknown as Record<symbol, unknown>;
  const oldContext = globals[key];
  globals[key] = { env: { DB: { prepare: (sql: string) => wrap(sql) } } };

  const names = ['SQUARE_APPLICATION_ID', 'SQUARE_APPLICATION_SECRET', 'SQUARE_OAUTH_REDIRECT_URI',
    'SQUARE_ENVIRONMENT', 'PAYMENT_CREDENTIALS_KEY'] as const;
  const previous = names.map((name) => process.env[name]);
  process.env.SQUARE_APPLICATION_ID = 'sandbox-demo-app';
  process.env.SQUARE_APPLICATION_SECRET = 'local-test-secret';
  process.env.SQUARE_OAUTH_REDIRECT_URI = 'https://unified.example.com/api/payments/square/callback';
  process.env.SQUARE_ENVIRONMENT = 'sandbox';
  process.env.PAYMENT_CREDENTIALS_KEY = randomBytes(32).toString('base64');
  const oldFetch = globalThis.fetch;
  let tokenRequests = 0;
  let locationRequests = 0;

  globalThis.fetch = async (url) => {
    if (String(url).endsWith('/oauth2/token')) {
      tokenRequests++;
      return Response.json({
        access_token: 'square-access-test-123',
        refresh_token: 'square-refresh-test-123',
        merchant_id: 'merchant-one',
        expires_at: '2099-01-01T00:00:00Z',
      });
    }
    if (String(url).endsWith('/v2/locations')) {
      locationRequests++;
      return Response.json({
        locations: [
          { id: 'location-a', name: 'Shop A', status: 'ACTIVE', currency: 'USD',
            capabilities: ['CREDIT_CARD_PROCESSING'], merchant_id: 'merchant-one' },
          { id: 'location-b', name: 'Shop B', status: 'ACTIVE', currency: 'USD',
            capabilities: ['CREDIT_CARD_PROCESSING'], merchant_id: 'merchant-one' },
          { id: 'different-merchant', status: 'ACTIVE', currency: 'USD',
            capabilities: ['CREDIT_CARD_PROCESSING'], merchant_id: 'merchant-other' },
        ],
      });
    }
    throw new Error('Unexpected provider HTTP request');
  };

  try {
    const authorization = new URL(await beginSquareOnboarding('org-a', 'user-a'));
    const state = authorization.searchParams.get('state')!;
    const wrong = () => finishSquareOnboarding({
      organizationId: 'org-b', userId: 'user-a', state, code: 'authorization-code',
    });
    await assert.rejects(wrong, /expired or was already used/);
    assert.equal(tokenRequests, 0);

    const first = await finishSquareOnboarding({
      organizationId: 'org-a', userId: 'user-a', state, code: 'authorization-code',
    });
    assert.equal(first.status, 'NEEDS_LOCATION');
    assert.equal(first.locationId, null);
    assert.equal(first.merchantId, 'merchant-one');
    assert.equal(tokenRequests, 1);
    assert.equal(locationRequests, 1);
    await assert.rejects(() => finishSquareOnboarding({
      organizationId: 'org-a', userId: 'user-a', state, code: 'authorization-code',
    }), /expired or was already used/);
    assert.equal(tokenRequests, 1);

    const saved = sqlite.prepare('SELECT * FROM SquareMerchantConnection WHERE organizationId = ?').get('org-a') as {
      accessCiphertext: string; refreshCiphertext: string;
    };
    assert.equal(saved.accessCiphertext.includes('square-access-test-123'), false);
    assert.equal(saved.refreshCiphertext.includes('square-refresh-test-123'), false);
    assert.equal(await getSquareMerchantStatus('org-b'), null);
    assert.deepEqual((await listSquareMerchantLocations('org-a')).map((x) => x.id), ['location-a', 'location-b']);
    await assert.rejects(() => selectSquareMerchantLocation('org-a', 'different-merchant'), /not found/);
    await selectSquareMerchantLocation('org-a', 'location-b');
    assert.equal((await getSquareMerchantStatus('org-a'))?.locationId, 'location-b');
    assert.equal((await getSquareMerchantStatus('org-a'))?.status, 'CONNECTED');
  } finally {
    globalThis.fetch = oldFetch;
    if (oldContext === undefined) delete globals[key];
    else globals[key] = oldContext;
    names.forEach((name, index) => {
      if (previous[index] === undefined) delete process.env[name];
      else process.env[name] = previous[index];
    });
    sqlite.close();
  }
});
