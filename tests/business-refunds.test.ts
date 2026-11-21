import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { randomBytes } from 'node:crypto';
import {
  stableRefundIdempotencyKey, businessRefundsEnabled,
  requestFullBusinessRefund, reconcileBusinessRefund, reconcileBusinessRefundFromProviderEvent,
} from '../src/lib/business-refunds';
import { encryptSquareCredential } from '../src/lib/square-connect';

test('refund idempotency is tenant scoped and release switches fail closed', () => {
  const a = stableRefundIdempotencyKey({ organizationId:'a',workflowId:'flow',submissionId:'sub' });
  const b = stableRefundIdempotencyKey({ organizationId:'b',workflowId:'flow',submissionId:'sub' });
  assert.equal(a, stableRefundIdempotencyKey({ organizationId:'a',workflowId:'flow',submissionId:'sub' }));
  assert.notEqual(a,b);
  assert.ok(a.length <= 45);
  const old = process.env.BUSINESS_REFUNDS_ENABLED;
  const oldMode = process.env.NODE_ENV;
  const oldApproval = process.env.BUSINESS_REFUNDS_PRODUCTION_APPROVED;
  try {
    delete process.env.BUSINESS_REFUNDS_ENABLED;
    assert.equal(businessRefundsEnabled(),false);
    process.env.BUSINESS_REFUNDS_ENABLED='true';
    process.env.NODE_ENV='production';
    delete process.env.BUSINESS_REFUNDS_PRODUCTION_APPROVED;
    assert.equal(businessRefundsEnabled(),false);
    process.env.BUSINESS_REFUNDS_PRODUCTION_APPROVED='true';
    assert.equal(businessRefundsEnabled(),true);
  } finally {
    if(old===undefined) delete process.env.BUSINESS_REFUNDS_ENABLED;
    else process.env.BUSINESS_REFUNDS_ENABLED=old;
    if(oldMode===undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV=oldMode;
    if(oldApproval===undefined) delete process.env.BUSINESS_REFUNDS_PRODUCTION_APPROVED;
    else process.env.BUSINESS_REFUNDS_PRODUCTION_APPROVED=oldApproval;
  }
});

test('a full Square refund is idempotent, pending until provider verified, and revokes paid access only once', async () => {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec([
    'CREATE TABLE WorkflowSubmission (id TEXT PRIMARY KEY NOT NULL, organizationId TEXT NOT NULL, workflowId TEXT NOT NULL, kind TEXT NOT NULL, name TEXT NOT NULL, email TEXT NOT NULL, phone TEXT, company TEXT, notes TEXT, answersJson TEXT NOT NULL DEFAULT \'{}\', status TEXT NOT NULL, paymentStatus TEXT NOT NULL, amountCents INTEGER NOT NULL, createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);',
    'CREATE TABLE SquareBusinessCheckout (submissionId TEXT PRIMARY KEY NOT NULL, organizationId TEXT NOT NULL, workflowId TEXT NOT NULL, merchantId TEXT NOT NULL, orderId TEXT NOT NULL UNIQUE, linkId TEXT NOT NULL, locationId TEXT NOT NULL, amountCents INTEGER NOT NULL, currency TEXT NOT NULL DEFAULT \'USD\', checkoutUrl TEXT NOT NULL, status TEXT NOT NULL DEFAULT \'PENDING\', paymentId TEXT, createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, paidAt TEXT);',
    'CREATE TABLE SquareMerchantConnection (organizationId TEXT PRIMARY KEY NOT NULL, merchantId TEXT NOT NULL, locationId TEXT, locationName TEXT, status TEXT NOT NULL, mode TEXT NOT NULL, tokenExpiresAt TEXT, accessCiphertext TEXT NOT NULL, refreshCiphertext TEXT NOT NULL, updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);',
    "INSERT INTO WorkflowSubmission (id,organizationId,workflowId,kind,name,email,status,paymentStatus,amountCents) VALUES ('sub-1','org-a','event-1','EVENT','Test Buyer','test@example.org','REGISTERED','PAID',2500);",
    "INSERT INTO SquareBusinessCheckout (submissionId,organizationId,workflowId,merchantId,orderId,linkId,locationId,amountCents,checkoutUrl,status,paymentId) VALUES ('sub-1','org-a','event-1','merchant-a','order-1','link-1','location-1',2500,'https://square.link/u/example','PAID','payment-1');",
  ].join('\n'));
  type Statement = {
    bind: (...args: SQLInputValue[]) => Statement;
    run: () => Promise<{ meta: { changes: number | bigint } }>;
    raw: (opts?: { columnNames?: boolean }) => Promise<unknown[]>;
  };
  const wrap = (sql: string, args: SQLInputValue[] = []): Statement => ({
    bind: (...values) => wrap(sql, values),
    async run() { return { meta: { changes: sqlite.prepare(sql).run(...args).changes } }; },
    async raw(opts = {}) {
      const statement = sqlite.prepare(sql);
      const columnNames = statement.columns().map((column) => column.name);
      statement.setReturnArrays(true);
      const rows = statement.all(...args);
      return opts.columnNames ? [columnNames, ...rows] : rows;
    },
  });
  const contextKey = Symbol.for('__cloudflare-context__');
  const globals = globalThis as unknown as Record<symbol, unknown>;
  const oldContext = globals[contextKey];
  globals[contextKey] = {env:{DB:{prepare:(sql:string)=>wrap(sql)}}};
  const names = ['SQUARE_APPLICATION_ID','SQUARE_APPLICATION_SECRET','SQUARE_OAUTH_REDIRECT_URI',
    'SQUARE_ENVIRONMENT','PAYMENT_CREDENTIALS_KEY','BUSINESS_REFUNDS_ENABLED','NODE_ENV'] as const;
  const savedEnv=names.map((name)=>process.env[name]);
  const encryptionKey=randomBytes(32).toString('base64');
  Object.assign(process.env,{
    SQUARE_APPLICATION_ID:'square-demo',SQUARE_APPLICATION_SECRET:'square-secret',
    SQUARE_OAUTH_REDIRECT_URI:'https://unified.example.com/api/payments/square/callback',
    SQUARE_ENVIRONMENT:'sandbox',PAYMENT_CREDENTIALS_KEY:encryptionKey,
    BUSINESS_REFUNDS_ENABLED:'true',NODE_ENV:'test',
  });
  sqlite.prepare('INSERT INTO SquareMerchantConnection (organizationId,merchantId,locationId,locationName,status,mode,tokenExpiresAt,accessCiphertext,refreshCiphertext) VALUES (?,?,?,?,?,?,?,?,?)')
    .run('org-a','merchant-a','location-1','Example Location','CONNECTED','sandbox','2099-01-01T00:00:00Z',
      encryptSquareCredential('square-test-token',encryptionKey),
      encryptSquareCredential('square-test-refresh',encryptionKey));

  let refundPosts=0;
  let refundStatus='PENDING';
  const oldFetch=globalThis.fetch;
  globalThis.fetch=async (url, init) => {
    assert.equal(new Headers(init?.headers).get('Authorization'),'Bearer square-test-token');
    if(String(url).endsWith('/v2/refunds') && init?.method==='POST') {
      refundPosts++;
      const body=JSON.parse(String(init.body));
      assert.equal(body.payment_id,'payment-1');
      assert.equal(body.amount_money.amount,2500);
      assert.equal(body.amount_money.currency,'USD');
      assert.ok(body.idempotency_key.length <= 45);
      return Response.json({refund:{
        id:'refund-1',payment_id:'payment-1',status:refundStatus,
        amount_money:{amount:2500,currency:'USD'},
      }});
    }
    if(String(url).endsWith('/v2/refunds/refund-1')) {
      return Response.json({refund:{
        id:'refund-1',payment_id:'payment-1',status:refundStatus,
        amount_money:{amount:2500,currency:'USD'},
      }});
    }
    throw new Error('Unexpected provider URL');
  };
  const input={organizationId:'org-a',workflowId:'event-1',submissionId:'sub-1'};
  try {
    await assert.rejects(
      () => requestFullBusinessRefund({...input, organizationId:'org-b'}),
      /BUSINESS_PAYMENT_NOT_FOUND/
    );
    const requested=await requestFullBusinessRefund(input);
    assert.equal(requested.state,'PENDING');
    assert.equal(refundPosts,1);
    assert.equal(sqlite.prepare('SELECT paymentStatus FROM WorkflowSubmission WHERE id = ?').get('sub-1')?.paymentStatus,'PAID');
    const retry=await requestFullBusinessRefund(input);
    assert.equal(retry.state,'PENDING');
    assert.equal(refundPosts,1);

    refundStatus='COMPLETED';
    assert.equal((await reconcileBusinessRefundFromProviderEvent({
      provider:'SQUARE',refundId:'refund-1',merchantId:'wrong-merchant'
    }).then(()=> 'bad', (error: Error) => error.message)), 'BUSINESS_REFUND_WEBHOOK_MERCHANT_MISMATCH');
    assert.equal((await reconcileBusinessRefund(input)).state,'COMPLETED');
    const updated=sqlite.prepare('SELECT paymentStatus,status FROM WorkflowSubmission WHERE id = ?').get('sub-1');
    assert.equal(updated?.paymentStatus,'REFUNDED');
    assert.equal(updated?.status,'CANCELLED');
    assert.equal((await requestFullBusinessRefund(input)).state,'COMPLETED');
    assert.equal(refundPosts,1);
  } finally {
    globalThis.fetch=oldFetch;
    if(oldContext===undefined) delete globals[contextKey];
    else globals[contextKey]=oldContext;
    names.forEach((name,i)=>{
      if(savedEnv[i]===undefined) delete process.env[name];
      else process.env[name]=savedEnv[i];
    });
    sqlite.close();
  }
});
