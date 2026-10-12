import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { storeAppleRevocationToken,revokeAppleIdentityTokens } from '../src/lib/apple-token-revocation';

test('Apple grant tokens stay encrypted, failures stay incomplete and successful revocation is idempotent',async()=>{
  const sqlite=new DatabaseSync(':memory:');
  type Value=string|number|null;
  const wrap=(sql:string,values:Value[]=[])=>({
    bind(...params:Value[]){return wrap(sql,params);},
    async run(){return {success:true,meta:{changes:sqlite.prepare(sql).run(...values).changes}};},
    async raw(options:{columnNames?:boolean}={}){const s=sqlite.prepare(sql);const columns=s.columns().map(c=>c.name);s.setReturnArrays(true);const rows=s.all(...values);return options.columnNames?[columns,...rows]:rows;},
    async all(){return {success:true,results:sqlite.prepare(sql).all(...values)};},
    async first(){return sqlite.prepare(sql).get(...values)||null;},
  });
  const context=globalThis as unknown as Record<symbol,unknown>;const key=Symbol.for('__cloudflare-context__');
  context[key]={env:{DB:{prepare:(sql:string)=>wrap(sql)},SOCIAL_APPLE_CLIENT_ID:'fixture-client',SOCIAL_APPLE_CLIENT_SECRET:'fixture-client-secret'}};
  const originalSecret=process.env.AUTH_SECRET;process.env.AUTH_SECRET='fixture-token-protection-secret';
  try{
    await assert.rejects(revokeAppleIdentityTokens(['missing'],async()=>{throw new Error('must not send');}),/sign in with Apple again/);
    await storeAppleRevocationToken('subject-fixture','fixture-client','fixture-private-refresh-token','refresh_token');
    const stored=sqlite.prepare('SELECT encryptedToken FROM AppleRevocationToken').get()!.encryptedToken;
    assert.equal(String(stored).includes('fixture-private-refresh-token'),false);
    await assert.rejects(revokeAppleIdentityTokens(['subject-fixture'],async()=>new Response('',{status:500})),/did not succeed/);
    assert.equal(sqlite.prepare('SELECT revokedAt FROM AppleRevocationToken').get()!.revokedAt,null);
    process.env.AUTH_SECRET='rotated-fixture-secret';
    await assert.rejects(revokeAppleIdentityTokens(['subject-fixture'],async()=>{throw new Error('must not send');}),/sign in with Apple again/);
    process.env.AUTH_SECRET='fixture-token-protection-secret';let calls=0;
    const send:typeof fetch=async(url,init)=>{
      calls++;assert.equal(String(url),'https://appleid.apple.com/auth/revoke');assert.equal(init!.redirect,'error');
      const params=new URLSearchParams(String(init!.body));assert.equal(params.get('token'),'fixture-private-refresh-token');
      assert.equal(params.get('token_type_hint'),'refresh_token');assert.equal(params.get('client_id'),'fixture-client');
      return new Response('',{status:200});
    };
    await revokeAppleIdentityTokens(['subject-fixture'],send);await revokeAppleIdentityTokens(['subject-fixture'],send);
    assert.equal(calls,1);assert.equal(sqlite.prepare('SELECT encryptedToken FROM AppleRevocationToken').get()!.encryptedToken,'revoked');
  } finally { if(originalSecret===undefined) delete process.env.AUTH_SECRET;else process.env.AUTH_SECRET=originalSecret;delete context[key];sqlite.close(); }
});
