import { prisma } from './prisma';
import { RECEIPT_SCHEMA } from './account-deletion-receipt';
import { APPLE_REVOCATION_SCHEMA } from './apple-token-revocation';

export async function ensureAccountDeletionTables() {
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS AccountDeletionRequest (
    id TEXT PRIMARY KEY NOT NULL, organizationId TEXT NOT NULL, userId TEXT NOT NULL,
    scope TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'PENDING',
    requestedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, resolvedAt TEXT, resolutionNote TEXT
  )`);
  await prisma.$executeRawUnsafe(RECEIPT_SCHEMA);
  await prisma.$executeRawUnsafe(APPLE_REVOCATION_SCHEMA);
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS SocialIdentity (
    provider TEXT NOT NULL,providerSubject TEXT NOT NULL,userId TEXT NOT NULL,email TEXT NOT NULL,
    createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(provider,providerSubject)
  )`);
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS AccountDeletionExecution (
    requestId TEXT PRIMARY KEY NOT NULL, claimToken TEXT NOT NULL, reviewedBy TEXT NOT NULL,
    trainingExpiresAt INTEGER NOT NULL, archiveIdsJson TEXT NOT NULL, completedAt INTEGER
  )`);
  await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS AccountDeletionRequest_org_status ON AccountDeletionRequest (organizationId, status, requestedAt)');
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS AccountDeletionReview (
    requestId TEXT PRIMARY KEY NOT NULL,
    reviewedBy TEXT NOT NULL,
    status TEXT NOT NULL,
    message TEXT NOT NULL,
    expectedCompletionAt TEXT,
    updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
}

export async function listDeletionRequests() {
  await ensureAccountDeletionTables();
  return prisma.$queryRawUnsafe<Array<{
    id: string; scope: string; status: string; requestedAt: string; userId: string;
    userName: string | null; email: string | null; organizationName: string | null;
    message: string | null; expectedCompletionAt: string | null;
  }>>(`SELECT r.id, r.scope, CASE WHEN r.status = 'PENDING' THEN COALESCE(review.status,r.status) ELSE r.status END AS status, r.requestedAt, r.userId,
    u.name AS userName, u.email, o.name AS organizationName,
    review.message, review.expectedCompletionAt
    FROM AccountDeletionRequest r
    LEFT JOIN User u ON u.id = r.userId
    LEFT JOIN Organization o ON o.id = r.organizationId
    LEFT JOIN AccountDeletionReview review ON review.requestId = r.id
    ORDER BY CASE WHEN r.status IN ('PENDING','UNDER_REVIEW','NEEDS_INFORMATION') THEN 0 ELSE 1 END,
      r.requestedAt ASC LIMIT 100`);
}

export async function previewAccountDeletion(requestId: string) {
  await ensureAccountDeletionTables();
  const rows = await prisma.$queryRawUnsafe<Array<{
    id: string; userId: string; organizationId: string; scope: string; status: string;
    email: string | null; userName: string | null;
  }>>(`SELECT r.id, r.userId, r.organizationId, r.scope, r.status,
    u.email, u.name AS userName FROM AccountDeletionRequest r
    LEFT JOIN User u ON u.id = r.userId WHERE r.id = ?`, requestId);
  const request = rows[0];
  if (!request) return null;
  const memberships = await prisma.$queryRawUnsafe<Array<{
    organizationId: string; organizationName: string; role: string; lastOwner: number;
  }>>(`SELECT m.organizationId, o.name AS organizationName, m.role,
    CASE WHEN m.role = 'OWNER' AND NOT EXISTS (
      SELECT 1 FROM Membership other WHERE other.organizationId = m.organizationId
        AND other.userId <> m.userId AND other.role = 'OWNER' AND other.status = 'ACTIVE'
    ) THEN 1 ELSE 0 END AS lastOwner
    FROM Membership m JOIN Organization o ON o.id = m.organizationId WHERE m.userId = ?`, request.userId);
  const records = await prisma.$queryRawUnsafe<Array<{ enrollments: number; credentials: number; acknowledgments: number }>>(`SELECT
    (SELECT COUNT(*) FROM Enrollment WHERE userId = ?) AS enrollments,
    (SELECT COUNT(*) FROM Credential WHERE userId = ?) AS credentials,
    (SELECT COUNT(*) FROM Acknowledgment WHERE userId = ?) AS acknowledgments`, request.userId, request.userId, request.userId);
  return { request, memberships, records: records[0],
    ownershipTransferRequired: memberships.filter(member => member.lastOwner === 1).map(member => member.organizationName),
    workspaceDeletion: request.scope === 'ORGANIZATION',
    globalConfirmationRequired: !(await prisma.$queryRawUnsafe<Array<{ confirmed: number }>>(
      'SELECT allMembershipsConfirmedAt AS confirmed FROM AccountDeletionReceipt WHERE requestId=?', requestId))[0]?.confirmed,
    retentionDays: 90,
    appleReconnectRequired: Boolean((await prisma.$queryRawUnsafe<Array<{ n: number }>>(
      "SELECT COUNT(*) AS n FROM SocialIdentity i LEFT JOIN AppleRevocationToken t ON t.providerSubject=i.providerSubject WHERE i.userId=? AND i.provider='apple' AND t.providerSubject IS NULL", request.userId))[0]?.n) };
}
