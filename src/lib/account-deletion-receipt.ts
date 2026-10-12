import { createHash, createHmac } from 'node:crypto';
import { prisma } from './prisma';

export const RECEIPT_SCHEMA = `CREATE TABLE IF NOT EXISTS AccountDeletionReceipt (
  requestId TEXT PRIMARY KEY NOT NULL, tokenHash TEXT NOT NULL UNIQUE,
  allMembershipsConfirmedAt INTEGER, expiresAt INTEGER
)`;
export function deletionReceiptToken(requestId: string, userId: string) {
  const secret = process.env.AUTH_SECRET;
  if (!secret && process.env.NODE_ENV === 'production') throw new Error('Receipt signing is unavailable');
  return createHmac('sha256', secret || 'local-deletion-receipt-fixture-only')
    .update(`unified-deletion-receipt-v1|${requestId}|${userId}`).digest('base64url');
}
export function deletionReceiptHash(token: string) { return createHash('sha256').update(token).digest('hex'); }
export async function recordDeletionReceipt(requestId: string, userId: string, allMemberships: boolean, origin: string) {
  await prisma.$executeRawUnsafe(RECEIPT_SCHEMA);
  const token = deletionReceiptToken(requestId, userId);
  await prisma.$executeRawUnsafe(`INSERT INTO AccountDeletionReceipt(requestId,tokenHash,allMembershipsConfirmedAt)
    VALUES (?,?,?) ON CONFLICT(requestId) DO UPDATE SET tokenHash=excluded.tokenHash,
    allMembershipsConfirmedAt=COALESCE(AccountDeletionReceipt.allMembershipsConfirmedAt,excluded.allMembershipsConfirmedAt)`,
    requestId, deletionReceiptHash(token), allMemberships ? Date.now() : null);
  return `${origin}/account-deletion/status#receipt=${token}`;
}
