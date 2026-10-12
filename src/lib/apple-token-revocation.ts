import { randomBytes } from 'node:crypto';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { prisma } from './prisma';
import { appleClientSecret, appleSigningConfigured } from './apple-client-secret';

export class AppleRevocationBlocked extends Error {}
export const APPLE_REVOCATION_SCHEMA = `CREATE TABLE IF NOT EXISTS AppleRevocationToken (
  providerSubject TEXT PRIMARY KEY NOT NULL, clientId TEXT NOT NULL,
  encryptedToken TEXT NOT NULL, tokenType TEXT NOT NULL, revokedAt INTEGER
)`;
async function encryptionKey() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new AppleRevocationBlocked('Apple token protection is unavailable');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`unified-apple-revocation-v1|${secret}`));
  return crypto.subtle.importKey('raw', digest, { name: 'AES-GCM' }, false, ['encrypt','decrypt']);
}
export async function storeAppleRevocationToken(subject: string, clientId: string, token: string, tokenType: 'refresh_token'|'access_token') {
  if (!token) return;
  await prisma.$executeRawUnsafe(APPLE_REVOCATION_SCHEMA);
  const iv = randomBytes(12);
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv,
    additionalData: new TextEncoder().encode(`${subject}|${clientId}`) }, await encryptionKey(), new TextEncoder().encode(token));
  await prisma.$executeRawUnsafe(`INSERT INTO AppleRevocationToken(providerSubject,clientId,encryptedToken,tokenType)
    VALUES (?,?,?,?) ON CONFLICT(providerSubject) DO UPDATE SET clientId=excluded.clientId,
    encryptedToken=excluded.encryptedToken,tokenType=excluded.tokenType,revokedAt=NULL`, subject, clientId,
    `${iv.toString('base64url')}.${Buffer.from(encrypted).toString('base64url')}`, tokenType);
}
export async function revokeAppleIdentityTokens(subjects: string[], send: typeof fetch = fetch) {
  if (!subjects.length) return;
  await prisma.$executeRawUnsafe(APPLE_REVOCATION_SCHEMA);
  const env = getCloudflareContext().env as Record<string, unknown>;
  for (const subject of subjects) {
    const rows = await prisma.$queryRawUnsafe<Array<{ clientId:string;encryptedToken:string;tokenType:string;revokedAt:number|null }>>(
      'SELECT clientId,encryptedToken,tokenType,revokedAt FROM AppleRevocationToken WHERE providerSubject=?', subject);
    const row = rows[0];
    if (!row) throw new AppleRevocationBlocked('The account holder must sign in with Apple again before Apple token revocation can be completed.');
    if (row.revokedAt) continue;
    const [iv, value] = row.encryptedToken.split('.');
    let token: string;
    try {
      token = new TextDecoder().decode(await crypto.subtle.decrypt({ name:'AES-GCM', iv:Buffer.from(iv,'base64url'),
        additionalData:new TextEncoder().encode(`${subject}|${row.clientId}`) }, await encryptionKey(), Buffer.from(value,'base64url')));
    } catch { throw new AppleRevocationBlocked('The account holder must sign in with Apple again to refresh token protection.'); }
    const configuredId = String(env.SOCIAL_APPLE_CLIENT_ID || '');
    const clientSecret = appleSigningConfigured(env) ? await appleClientSecret(env,row.clientId)
      : row.clientId === configuredId ? String(env.SOCIAL_APPLE_CLIENT_SECRET || '') : '';
    if (!clientSecret) throw new AppleRevocationBlocked('Apple token revocation credentials are unavailable.');
    const response = await send('https://appleid.apple.com/auth/revoke', { method:'POST', redirect:'error',
      headers:{'content-type':'application/x-www-form-urlencoded'},
      body:new URLSearchParams({client_id:row.clientId,client_secret:clientSecret,token,token_type_hint:row.tokenType}),
      signal:AbortSignal.timeout(8000) });
    await response.body?.cancel().catch(()=>{});
    if (response.status !== 200) throw new AppleRevocationBlocked('Apple token revocation did not succeed; account deletion remains incomplete.');
    await prisma.$executeRawUnsafe('UPDATE AppleRevocationToken SET revokedAt=?,encryptedToken=? WHERE providerSubject=?',Date.now(),'revoked',subject);
  }
}
