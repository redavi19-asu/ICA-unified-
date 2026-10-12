import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createHmac } from 'node:crypto';
import { enqueueWebhookEvent, deliverWebhook, drainWebhookOutbox, WEBHOOK_OUTBOX_SCHEMA, WEBHOOK_OUTBOX_INDEX, type WebhookDatabase } from '../src/lib/webhook-delivery';

function fixture() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(`CREATE TABLE WebhookEndpoint (id TEXT PRIMARY KEY, organizationId TEXT, url TEXT, secret TEXT, active INTEGER,
    lastDeliveryAt TEXT, lastStatus INTEGER, lastError TEXT);
    CREATE TABLE WebhookDelivery (id TEXT PRIMARY KEY, organizationId TEXT, endpointId TEXT, eventType TEXT,
    responseStatus INTEGER, success INTEGER, error TEXT, createdAt TEXT);
    ${WEBHOOK_OUTBOX_SCHEMA}; ${WEBHOOK_OUTBOX_INDEX};
    INSERT INTO WebhookEndpoint (id, organizationId, url, secret, active) VALUES
    ('hook-1','org-1','https://receiver.example/hook','test-signing-secret',1),
    ('hook-2','org-1','https://receiver.example/second','test-signing-secret',1),
    ('foreign','org-2','https://other.example/hook','foreign-test-secret',1);`);
  const db: WebhookDatabase = {
    async all<T>(sql: string, ...values: (string | number | null)[]) { return sqlite.prepare(sql).all(...values) as T[]; },
    async run(sql, ...values) { return Number(sqlite.prepare(sql).run(...values).changes); },
  };
  let time = Date.parse('2026-10-12T12:00:00Z');
  const now = () => time;
  const body = JSON.stringify({id:'event-1',event:'member.created',createdAt:new Date(time).toISOString(),data:{memberId:'example'}});
  const enqueue = (endpointIds=['hook-1'], eventId='event-1') => enqueueWebhookEvent(db, {organizationId:'org-1',endpointIds,eventId,eventType:'member.created',body},time);
  type Snapshot = { payloadJson: string; attempts: number; nextAttemptAt: number; status: string; expiresAt: number; finishedAt: number; lastError: string | null };
  const row = () => sqlite.prepare('SELECT * FROM WebhookOutbox ORDER BY id').get() as Snapshot | undefined;
  return {sqlite,db,now,body,enqueue,row,setTime:(value:number)=>{time=value;}};
}

test('failed delivery survives a later drain with the identical signed event and stops after success', async () => {
  const f=fixture(); const [id]=await f.enqueue(); const bodies:string[]=[]; const eventIds:string[]=[];
  const send: typeof fetch=async (_url,init) => {
    bodies.push(String(init!.body)); const h=new Headers(init!.headers); eventIds.push(h.get('X-ICA-Event-ID')!);
    assert.equal(h.get('X-ICA-Signature'),`sha256=${createHmac('sha256','test-signing-secret').update(f.body).digest('hex')}`);
    assert.equal(init!.redirect,'error'); assert.ok(init!.signal);
    return new Response('',{status:bodies.length===1?503:200});
  };
  assert.equal((await deliverWebhook(f.db,id,{now:f.now,send}))?.queued,true);
  assert.equal(f.row()!.payloadJson,f.body); assert.equal(f.row()!.attempts,1);
  await drainWebhookOutbox(f.db,{now:f.now,send}); assert.equal(bodies.length,1);
  f.setTime(f.row()!.nextAttemptAt+1);
  await drainWebhookOutbox(f.db,{now:f.now,send}); await drainWebhookOutbox(f.db,{now:f.now,send});
  assert.deepEqual(bodies,[f.body,f.body]); assert.deepEqual(eventIds,['event-1','event-1']);
  assert.equal(f.row()!.status,'SENT'); assert.equal(f.row()!.attempts,2); assert.equal(f.row()!.payloadJson,'{}');
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM WebhookDelivery').get()!.n,2);
});

test('concurrent request and scheduler cannot send the same claimed delivery twice', async () => {
  const f=fixture(); const [id]=await f.enqueue(); let calls=0; let release!:()=>void; let entered!:()=>void;
  const waiting=new Promise<void>(resolve=>{release=resolve;});const started=new Promise<void>(resolve=>{entered=resolve;});
  const send:typeof fetch=async()=>{calls++;entered();await waiting;return new Response('',{status:200});};
  const first=deliverWebhook(f.db,id,{now:f.now,send});await started;
  assert.equal(await deliverWebhook(f.db,id,{now:f.now,send}),null);release();await first;assert.equal(calls,1);
});

test('expired process lease is recovered after an interrupted send',async()=>{
  const f=fixture();const [id]=await f.enqueue();
  f.sqlite.prepare("UPDATE WebhookOutbox SET status='PROCESSING',attempts=1,leaseToken='old',leaseUntil=? WHERE id=?").run(f.now()-1,id);
  let calls=0;await drainWebhookOutbox(f.db,{now:f.now,send:async()=>{calls++;return new Response('',{status:200});}});
  assert.equal(calls,1);assert.equal(f.row()!.status,'SENT');assert.equal(f.row()!.attempts,2);
});

test('foreign organizations cannot be queued and removed endpoints never receive a pending retry',async()=>{
  const f=fixture(); assert.deepEqual(await f.enqueue(['foreign']),[]);const [id]=await f.enqueue();
  await deliverWebhook(f.db,id,{now:f.now,send:async()=>new Response('',{status:429})});
  f.sqlite.exec("DELETE FROM WebhookEndpoint WHERE id='hook-1'");f.setTime(f.row()!.nextAttemptAt+1);
  await drainWebhookOutbox(f.db,{now:f.now,send:async()=>{throw new Error('must never send');}});
  assert.equal(f.row()!.status,'CANCELLED');assert.equal(f.row()!.payloadJson,'{}');
});

test('permanent rejection stops, transient rejection has a bounded retry count',async()=>{
  const permanent=fixture();const [id]=await permanent.enqueue();
  const result=await deliverWebhook(permanent.db,id,{now:permanent.now,send:async()=>new Response('',{status:401})});
  assert.equal(result?.queued,false);assert.equal(permanent.row()!.status,'FAILED');
  const transient=fixture();const [nextId]=await transient.enqueue();let calls=0;
  for(let i=0;i<10;i++){
    await deliverWebhook(transient.db,nextId,{now:transient.now,send:async()=>{calls++;return new Response('',{status:503});}});
    transient.setTime(transient.row()!.nextAttemptAt+1);
  }
  assert.equal(calls,8);assert.equal(transient.row()!.status,'FAILED');assert.equal(transient.row()!.attempts,8);
});

test('expired delivery is marked failed without sending, and old payloads are purged',async()=>{
  const f=fixture();await f.enqueue();f.setTime(f.row()!.expiresAt+1);
  await drainWebhookOutbox(f.db,{now:f.now,send:async()=>{throw new Error('must never send');}});
  assert.equal(f.row()!.status,'FAILED');f.setTime(f.row()!.finishedAt+7*24*60*60_000+1);
  await drainWebhookOutbox(f.db,{now:f.now});assert.equal(f.row(),undefined);
});

test('fan-out is persisted atomically before any endpoint can be sent',async()=>{
  const f=fixture();f.sqlite.exec("CREATE TRIGGER reject_second BEFORE INSERT ON WebhookOutbox WHEN NEW.endpointId='hook-2' BEGIN SELECT RAISE(ABORT,'simulated storage failure'); END;");
  await assert.rejects(f.enqueue(['hook-1','hook-2']));assert.equal(f.row(),undefined);
});

test('scheduler bounds each batch and network failures do not retain private exception strings',async()=>{
  const f=fixture();await f.enqueue(['hook-1','hook-2']);let calls=0;
  await drainWebhookOutbox(f.db,{now:f.now,limit:1,send:async()=>{calls++;throw new Error('private receiver credential');}});
  assert.equal(calls,1);assert.equal(f.row()!.lastError,'Receiver request failed or timed out');
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS n FROM WebhookOutbox WHERE attempts=0").get()!.n,1);
});
