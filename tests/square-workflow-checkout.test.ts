import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { randomBytes } from 'node:crypto';
import {
  createSquareWorkflowCheckout, confirmSquareWorkflowCheckout, reconcileSquareWebhookOrder,
} from '../src/lib/square-workflow-checkout';
import { encryptSquareCredential } from '../src/lib/square-connect';
import type { PublicWorkflow } from '../src/lib/workflow-execution';

test('Square checkout stays pending until a matching settled provider payment is confirmed', async () => {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec([
    'CREATE TABLE Organization (id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL);',
    'CREATE TABLE WorkflowDefinition (id TEXT PRIMARY KEY NOT NULL, organizationId TEXT NOT NULL, kind TEXT NOT NULL, name TEXT NOT NULL, status TEXT NOT NULL, configJson TEXT NOT NULL);',
    'CREATE TABLE WorkflowSubmission (id TEXT PRIMARY KEY NOT NULL, organizationId TEXT NOT NULL, workflowId TEXT NOT NULL, kind TEXT NOT NULL, name TEXT NOT NULL, email TEXT NOT NULL, phone TEXT, company TEXT, notes TEXT, answersJson TEXT NOT NULL DEFAULT \'{}\', status TEXT NOT NULL, paymentStatus TEXT NOT NULL, amountCents INTEGER NOT NULL, createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);',
    'CREATE TABLE SquareMerchantConnection (organizationId TEXT PRIMARY KEY NOT NULL, merchantId TEXT NOT NULL, locationId TEXT, locationName TEXT, status TEXT NOT NULL, mode TEXT NOT NULL, tokenExpiresAt TEXT, accessCiphertext TEXT NOT NULL, refreshCiphertext TEXT NOT NULL, updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);',
    "INSERT INTO Organization (id,name) VALUES ('org-one','Example Organization'), ('org-two','Other Organization');",
    "INSERT INTO WorkflowDefinition (id,organizationId,kind,name,status,configJson) VALUES ('event-1','org-one','EVENT','Test Convention','ACTIVE','{\"price\":25}');",
    "INSERT INTO WorkflowSubmission (id,organizationId,workflowId,kind,name,email,status,paymentStatus,amountCents) VALUES ('submission-1','org-one','event-1','EVENT','Synthetic Buyer','buyer@example.com','PAYMENT_PENDING','PENDING',2500);",
  ].join('\n'));

  type Statement = {
    bind: (...args: SQLInputValue[]) => Statement;
    run: () => Promise<{ meta: { changes: number | bigint } }>;
    raw: (opts?: { columnNames?: boolean }) => Promise<unknown[]>;
  };
  const wrap = (sql: string, values: SQLInputValue[] = []): Statement => ({
    bind: (...args) => wrap(sql, args),
    async run() { return { meta: { changes: sqlite.prepare(sql).run(...values).changes } }; },
    async raw(opts = {}) {
      const stmt = sqlite.prepare(sql);
      const columns = stmt.columns().map((column) => column.name);
      stmt.setReturnArrays(true);
      const rows = stmt.all(...values);
      return opts.columnNames ? [columns, ...rows] : rows;
    },
  });
  const contextKey = Symbol.for('__cloudflare-context__');
  const globals = globalThis as unknown as Record<symbol, unknown>;
  const oldContext = globals[contextKey];
  globals[contextKey] = { env: { DB: { prepare: (sql: string) => wrap(sql) } } };

  const keys = ['SQUARE_APPLICATION_ID','SQUARE_APPLICATION_SECRET','SQUARE_OAUTH_REDIRECT_URI',
    'SQUARE_ENVIRONMENT','PAYMENT_CREDENTIALS_KEY','SQUARE_CUSTOMER_CHECKOUT_ENABLED',
    'SQUARE_WEBHOOK_SIGNATURE_KEY','SQUARE_WEBHOOK_NOTIFICATION_URL'] as const;
  const oldValues = keys.map((key) => process.env[key]);
  const credentialKey = randomBytes(32).toString('base64');
  Object.assign(process.env, {
    SQUARE_APPLICATION_ID: 'synthetic-square-app',
    SQUARE_APPLICATION_SECRET: 'synthetic-square-secret',
    SQUARE_OAUTH_REDIRECT_URI: 'https://unified.example.com/api/payments/square/callback',
    SQUARE_ENVIRONMENT: 'sandbox',
    PAYMENT_CREDENTIALS_KEY: credentialKey,
    SQUARE_CUSTOMER_CHECKOUT_ENABLED: 'true',
    SQUARE_WEBHOOK_SIGNATURE_KEY: 'local-webhook-signature-only',
    SQUARE_WEBHOOK_NOTIFICATION_URL: 'https://unified.example.com/api/payments/square/webhook',
  });
  sqlite.prepare('INSERT INTO SquareMerchantConnection (organizationId,merchantId,locationId,locationName,status,mode,tokenExpiresAt,accessCiphertext,refreshCiphertext) VALUES (?,?,?,?,?,?,?,?,?)')
    .run('org-one','merchant-one','location-one','Shop One','CONNECTED','sandbox','2099-01-01T00:00:00Z',
      encryptSquareCredential('synthetic-access', credentialKey), encryptSquareCredential('synthetic-refresh', credentialKey));

  let checkoutCalls=0, paymentSettled=false, wrongAmount=false;
  const oldFetch=globalThis.fetch;
  globalThis.fetch=async (url,init) => {
    const address=String(url);
    assert.equal(new Headers(init?.headers).get('Authorization'),'Bearer synthetic-access');
    if (address.endsWith('/v2/online-checkout/payment-links')) {
      checkoutCalls++;
      const body=JSON.parse(String(init?.body));
      assert.equal(body.quick_pay.price_money.amount,2500);
      assert.equal(body.quick_pay.location_id,'location-one');
      return Response.json({payment_link:{id:'link-one',order_id:'order-one',url:'https://square.link/u/test123'}});
    }
    if (address.endsWith('/v2/orders/order-one')) {
      return Response.json({order:{id:'order-one',location_id:'location-one',
        total_money:{amount:wrongAmount?200:2500,currency:'USD'},
        tenders:paymentSettled?[{payment_id:'payment-one'}]:[]}});
    }
    if (address.endsWith('/v2/payments/payment-one')) {
      return Response.json({payment:{id:'payment-one',order_id:'order-one',location_id:'location-one',
        status:'COMPLETED',amount_money:{amount:2500,currency:'USD'}}});
    }
    throw new Error('Unexpected Square URL');
  };
  const workflow:PublicWorkflow={
    id:'event-1',organizationId:'org-one',organizationName:'Example Organization',
    kind:'EVENT',name:'Test Convention',status:'ACTIVE',config:{price:25},
  };
  const origin='https://unified.example.com';
  const args={workflowId:'event-1',submissionId:'submission-1',origin};

  try {
    const result=await createSquareWorkflowCheckout({workflow,submissionId:'submission-1',origin});
    assert.equal(result.provider,'SQUARE');
    assert.equal(result.checkoutUrl,'https://square.link/u/test123');
    await createSquareWorkflowCheckout({workflow,submissionId:'submission-1',origin});
    assert.equal(checkoutCalls,1);

    assert.equal((await confirmSquareWorkflowCheckout(args)).paid,false);
    assert.equal(sqlite.prepare('SELECT paymentStatus FROM WorkflowSubmission').get()?.paymentStatus,'PENDING');

    paymentSettled=true;
    wrongAmount=true;
    await assert.rejects(() => confirmSquareWorkflowCheckout(args), /SQUARE_ORDER_AMOUNT_MISMATCH/);
    assert.equal(sqlite.prepare('SELECT paymentStatus FROM WorkflowSubmission').get()?.paymentStatus,'PENDING');
    wrongAmount=false;

    assert.equal((await reconcileSquareWebhookOrder('order-one','wrong-merchant',origin)).found,false);
    const paid=await confirmSquareWorkflowCheckout(args);
    assert.equal(paid.paid,true);
    assert.equal(paid.status,'REGISTERED');
    assert.equal(sqlite.prepare('SELECT paymentStatus FROM WorkflowSubmission').get()?.paymentStatus,'PAID');
    assert.equal((await reconcileSquareWebhookOrder('order-one','merchant-one',origin)).paid,true);
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM EmailOutbox').get()?.n,1);
  } finally {
    globalThis.fetch=oldFetch;
    if(oldContext===undefined) delete globals[contextKey];
    else globals[contextKey]=oldContext;
    keys.forEach((key,i)=> {
      if(oldValues[i]===undefined) delete process.env[key];
      else process.env[key]=oldValues[i];
    });
    sqlite.close();
  }
});
