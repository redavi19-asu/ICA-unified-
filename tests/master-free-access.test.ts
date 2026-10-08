import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readUnifiedEmailGrant } from '../src/lib/master-free-access';

test('Unified reads only an active, unexpired grant for the matching sign-in email', async()=>{
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(`CREATE TABLE email_access_grants(email TEXT,product_slug TEXT,status TEXT,expires_at INTEGER);
    INSERT INTO email_access_grants VALUES ('person@example.com','ica-unified','active',2000);
    INSERT INTO email_access_grants VALUES ('other@example.com','ica-control','active',NULL);`);
  const wrap=(sql:string,values:any[]=[])=>({bind:(...args:any[])=>wrap(sql,args),first:async()=>sqlite.prepare(sql).get(...values)});
  const database={prepare:(sql:string)=>wrap(sql)};
  assert.ok(await readUnifiedEmailGrant(database,' PERSON@EXAMPLE.COM ',1999));
  assert.equal(await readUnifiedEmailGrant(database,'person@example.com',2000),undefined);
  assert.equal(await readUnifiedEmailGrant(database,'other@example.com',1000),undefined);
  sqlite.exec("UPDATE email_access_grants SET status='revoked'");
  assert.equal(await readUnifiedEmailGrant(database,'person@example.com',1000),undefined);
  sqlite.close();
});
