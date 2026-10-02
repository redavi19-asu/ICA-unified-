import test from 'node:test';
import assert from 'node:assert/strict';
import { appleSigningConfigured, appleClientSecret } from '../src/lib/apple-client-secret';

test('Apple client assertions verify with ES256, expire promptly and are scoped to the app', async () => {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const der = await crypto.subtle.exportKey('pkcs8', pair.privateKey);
  const pem = `-----BEGIN PRIVATE KEY-----\n${Buffer.from(der).toString('base64')}\n-----END PRIVATE KEY-----`;
  const env = { SOCIAL_APPLE_TEAM_ID: 'TEAM123456', SOCIAL_APPLE_KEY_ID: 'KEY1234567', SOCIAL_APPLE_PRIVATE_KEY: pem };
  assert.equal(appleSigningConfigured(env), true);
  for (const key of ['SOCIAL_APPLE_TEAM_ID', 'SOCIAL_APPLE_KEY_ID', 'SOCIAL_APPLE_PRIVATE_KEY']) assert.equal(appleSigningConfigured({ ...env, [key]: '' }), false);
  for (const privateKey of [pem, pem.replace(/\n/g, '\\n')]) {
    const token = await appleClientSecret({ ...env, SOCIAL_APPLE_PRIVATE_KEY: privateKey }, 'com.example.web');
    const [h,p,s] = token.split('.');
    assert.deepEqual(JSON.parse(Buffer.from(h,'base64url').toString('utf8')), {alg:'ES256',kid:'KEY1234567'});
    const claims=JSON.parse(Buffer.from(p,'base64url').toString('utf8'));
    assert.equal(claims.iss,'TEAM123456'); assert.equal(claims.sub,'com.example.web'); assert.equal(claims.aud,'https://appleid.apple.com');
    assert.equal(claims.exp-claims.iat,300); assert.ok(Math.abs(claims.iat-Math.floor(Date.now()/1000))<5);
    assert.equal(await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},pair.publicKey,Buffer.from(s,'base64url'),new TextEncoder().encode(`${h}.${p}`)),true);
    assert.equal(await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},pair.publicKey,Buffer.from(s,'base64url'),new TextEncoder().encode(`${h}.${p}tampered`)),false);
  }
  await assert.rejects(appleClientSecret({...env,SOCIAL_APPLE_PRIVATE_KEY:'INVALID-PRIVATE-KEY'},'com.example.web'),{message:'Apple sign-in signing credentials are invalid.'});
});
