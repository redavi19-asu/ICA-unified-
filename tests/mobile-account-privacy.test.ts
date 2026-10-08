import assert from 'node:assert/strict';
import test from 'node:test';
import { GET, POST } from '../src/app/api/account/deletion-request/route';

test('invalid native credentials cannot read or create deletion requests', async () => {
  const previous = process.env.AUTH_SECRET;
  process.env.AUTH_SECRET = 'account-privacy-test-secret-only';
  try {
    for (const authorization of ['Bearer invalid-session', 'Basic invalid-session', '']) {
      const headers = { authorization, 'content-type': 'application/json' };
      const read = await GET(new Request('https://example.test/api/account/deletion-request', { headers }));
      assert.equal(read.status, 401);
      const write = await POST(new Request('https://example.test/api/account/deletion-request', {
        method: 'POST', headers, body: JSON.stringify({ scope: 'ACCOUNT', confirmation: 'DELETE' }),
      }));
      assert.equal(write.status, 401);
    }
  } finally {
    if (previous === undefined) delete process.env.AUTH_SECRET;
    else process.env.AUTH_SECRET = previous;
  }
});
