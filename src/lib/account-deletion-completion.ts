import { randomUUID } from 'node:crypto';
import { applicationDatabase } from './application-database';
import { ensureUnifiedRuntimeSchema } from './runtime-schema';
import { ensureTrainingArchive } from './training-retention';
import { revokeAppleIdentityTokens, AppleRevocationBlocked } from './apple-token-revocation';

export const ACCOUNT_TRAINING_RETENTION_DAYS = 90;
export const DELETION_EXECUTION_SCHEMA = `CREATE TABLE IF NOT EXISTS AccountDeletionExecution (
  requestId TEXT PRIMARY KEY NOT NULL, claimToken TEXT NOT NULL,
  reviewedBy TEXT NOT NULL, trainingExpiresAt INTEGER NOT NULL,
  archiveIdsJson TEXT NOT NULL, completedAt INTEGER
)`;
export class DeletionBlocked extends Error {}

export async function completeAccountDeletion(input: { requestId: string; reviewedBy: string }) {
  await ensureUnifiedRuntimeSchema();
  const db = applicationDatabase();
  const adapter = { async run(sql: string, ...values: (string | number | null)[]) {
    const result = await db.prepare(sql).bind(...values).run(); return result.meta.changes;
  } };
  await ensureTrainingArchive(adapter);
  await db.prepare(DELETION_EXECUTION_SCHEMA).run();
  const request = await db.prepare('SELECT * FROM AccountDeletionRequest WHERE id=?').bind(input.requestId)
    .first<{ userId:string; scope:string; status:string }>();
  if (!request || request.scope !== 'ACCOUNT') throw new DeletionBlocked('Workspace closure is a separate reviewed action.');
  if (request.status === 'COMPLETED') {
    const completed = await db.prepare('SELECT completedAt,trainingExpiresAt FROM AccountDeletionExecution WHERE requestId=?')
      .bind(input.requestId).first<{completedAt:number;trainingExpiresAt:number}>();
    if (completed?.completedAt) return completed;
    throw new DeletionBlocked('This request is already resolved.');
  }
  if (!['PENDING','UNDER_REVIEW','NEEDS_INFORMATION'].includes(request.status)) throw new DeletionBlocked('This request is no longer active.');
  const review = await db.prepare('SELECT status FROM AccountDeletionReview WHERE requestId=?').bind(input.requestId).first<{status:string}>();
  if (review?.status !== 'UNDER_REVIEW') throw new DeletionBlocked('Save an under-review update before confirming completion.');
  const user = await db.prepare('SELECT id,email FROM User WHERE id=?').bind(request.userId).first<{id:string;email:string}>();
  if (!user) throw new DeletionBlocked('The account is missing; verify prior removal before resolving the request.');
  const consent = await db.prepare('SELECT allMembershipsConfirmedAt FROM AccountDeletionReceipt WHERE requestId=?')
    .bind(input.requestId).first<{allMembershipsConfirmedAt:number|null}>();
  if (!consent?.allMembershipsConfirmedAt) throw new DeletionBlocked('The account holder must confirm removal from all Unified workspaces.');
  const owners = await db.prepare(`SELECT organizationId FROM Membership m WHERE m.userId=? AND m.role='OWNER'
    AND NOT EXISTS (SELECT 1 FROM Membership other WHERE other.organizationId=m.organizationId
      AND other.userId<>m.userId AND other.role='OWNER' AND other.status='ACTIVE')`).bind(user.id).all();
  if (owners.results.length) throw new DeletionBlocked('Transfer workspace ownership or complete its separate closure review first.');
  if (await db.prepare('SELECT id FROM PlatformAdmin WHERE lower(email)=lower(?) AND active=1').bind(user.email).first()) {
    throw new DeletionBlocked('Privileged platform accounts require a separate access-removal review.');
  }
  const tables = new Set((await db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all<{name:string}>()).results.map(row=>row.name));
  const appleSubjects = tables.has('SocialIdentity') ? (await db.prepare("SELECT providerSubject FROM SocialIdentity WHERE userId=? AND provider='apple'")
    .bind(user.id).all<{providerSubject:string}>()).results.map(row=>row.providerSubject) : [];
  // Never claim completion while Apple still has a live authorization grant.
  try { await revokeAppleIdentityTokens(appleSubjects); }
  catch (error) { if (error instanceof AppleRevocationBlocked) throw new DeletionBlocked(error.message); throw error; }
  const organizations = (await db.prepare(`SELECT organizationId FROM Membership WHERE userId=?
    UNION SELECT organizationId FROM Enrollment WHERE userId=?
    UNION SELECT organizationId FROM Credential WHERE userId=?
    UNION SELECT organizationId FROM CreditLedger WHERE userId=?
    UNION SELECT organizationId FROM Acknowledgment WHERE userId=?`).bind(user.id,user.id,user.id,user.id,user.id).all<{organizationId:string}>()).results;
  if (organizations.length > 100) throw new DeletionBlocked('This account requires a larger organization-data review.');
  const now = Date.now();
  const expiresAt = now + ACCOUNT_TRAINING_RETENTION_DAYS * 86400000;
  const claim = randomUUID();
  const archives = organizations.map(row=>({id:randomUUID(),organizationId:row.organizationId}));
  const guard = 'EXISTS (SELECT 1 FROM AccountDeletionExecution WHERE requestId=? AND claimToken=? AND completedAt IS NULL)';
  const statement = (sql: string, ...values: (string | number | null)[]) => db.prepare(sql).bind(...values);
  const guarded = (sql: string, values: (string | number | null)[] = []) => statement(`${sql} AND ${guard}`,...values,input.requestId,claim);
  const statements = [statement(`INSERT INTO AccountDeletionExecution(requestId,claimToken,reviewedBy,trainingExpiresAt,archiveIdsJson)
    SELECT r.id,?,?,?,? FROM AccountDeletionRequest r JOIN User u ON u.id=r.userId
    WHERE r.id=? AND r.scope='ACCOUNT' AND r.status IN ('PENDING','UNDER_REVIEW','NEEDS_INFORMATION')
      AND u.id=? AND u.email=?
      AND EXISTS (SELECT 1 FROM PlatformAdmin operator WHERE operator.id=? AND operator.active=1 AND operator.role IN ('MASTER','PLATFORM_ADMIN'))
      AND NOT EXISTS (SELECT organizationId FROM (
        SELECT organizationId FROM Membership WHERE userId=u.id UNION SELECT organizationId FROM Enrollment WHERE userId=u.id
        UNION SELECT organizationId FROM Credential WHERE userId=u.id UNION SELECT organizationId FROM CreditLedger WHERE userId=u.id
        UNION SELECT organizationId FROM Acknowledgment WHERE userId=u.id
      ) WHERE organizationId NOT IN (SELECT value FROM json_each(?)))
      AND EXISTS (SELECT 1 FROM AccountDeletionReceipt receipt WHERE receipt.requestId=r.id AND receipt.allMembershipsConfirmedAt IS NOT NULL)
      AND EXISTS (SELECT 1 FROM AccountDeletionReview review WHERE review.requestId=r.id AND review.status='UNDER_REVIEW')
      AND NOT EXISTS (SELECT 1 FROM SocialIdentity i LEFT JOIN AppleRevocationToken t ON t.providerSubject=i.providerSubject
        WHERE i.userId=u.id AND i.provider='apple' AND t.revokedAt IS NULL)
      AND NOT EXISTS (SELECT 1 FROM PlatformAdmin p WHERE lower(p.email)=lower(u.email) AND p.active=1)
      AND NOT EXISTS (SELECT 1 FROM Membership m WHERE m.userId=u.id AND m.role='OWNER'
        AND NOT EXISTS (SELECT 1 FROM Membership other WHERE other.organizationId=m.organizationId
          AND other.userId<>m.userId AND other.role='OWNER' AND other.status='ACTIVE'))
    ON CONFLICT(requestId) DO NOTHING`,claim,input.reviewedBy,expiresAt,JSON.stringify(archives.map(row=>row.id)),input.requestId,user.id,user.email,input.reviewedBy,JSON.stringify(archives.map(row=>row.organizationId)))];
  const stamp = (column: string) => `CASE WHEN typeof(${column}) IN ('integer','real') THEN strftime('%Y-%m-%dT%H:%M:%fZ',${column}/1000.0,'unixepoch') ELSE strftime('%Y-%m-%dT%H:%M:%fZ',${column}) END`;
  for (const archive of archives) {
    // Snapshots are taken inside the same transaction as account removal.
    // These allowlists omit names, email, user/request IDs, codes and free text.
    statements.push(statement(`INSERT INTO AccountTrainingArchive(id,organizationId,recordsJson,createdAt,expiresAt)
      SELECT ?,?,json_object('version',1,
        'courses',json((SELECT json_group_array(json_object('courseId',courseId,'status',CASE WHEN status IN ('NOT_STARTED','IN_PROGRESS','COMPLETE') THEN status ELSE 'OTHER' END,'progress',MIN(100,MAX(0,CAST(progress AS REAL))),'score',CASE WHEN score IS NULL THEN NULL ELSE MIN(100,MAX(0,CAST(score AS REAL))) END,'completedAt',${stamp('completedAt')})) FROM Enrollment WHERE userId=? AND organizationId=?)),
        'credentials',json((SELECT json_group_array(json_object('courseId',(SELECT courseId FROM Enrollment WHERE id=Credential.enrollmentId),'status',CASE WHEN lower(status) IN ('active','expired','revoked') THEN lower(status) ELSE 'other' END,'issuedAt',${stamp('issuedAt')},'expiresAt',${stamp('expiresAt')})) FROM Credential WHERE userId=? AND organizationId=?)),
        'credits',json((SELECT json_group_array(json_object('sourceType',CASE WHEN sourceType IN ('COURSE','EVENT') THEN sourceType ELSE 'OTHER' END,'sourceId',CASE WHEN sourceId NOT GLOB '*[^a-zA-Z0-9_-]*' AND length(sourceId) BETWEEN 1 AND 128 THEN sourceId ELSE 'unknown' END,'credits',MAX(0,CAST(credits AS REAL)),'awardedAt',${stamp('awardedAt')})) FROM CreditLedger WHERE userId=? AND organizationId=?)),
        'acknowledgments',json((SELECT json_group_array(json_object('documentId',documentId,'acknowledgedAt',${stamp('acknowledgedAt')})) FROM Acknowledgment WHERE userId=? AND organizationId=?))
      ),?,? WHERE ${guard}`,archive.id,archive.organizationId,user.id,archive.organizationId,user.id,archive.organizationId,user.id,archive.organizationId,user.id,archive.organizationId,now,expiresAt,input.requestId,claim));
  }
  statements.push(statement(`INSERT INTO PrincipalSessionState(scope,principalId,invalidAfter,updatedAt)
    SELECT 'user',?,?,CURRENT_TIMESTAMP WHERE ${guard}
    ON CONFLICT(scope,principalId) DO UPDATE SET invalidAfter=MAX(PrincipalSessionState.invalidAfter,excluded.invalidAfter),updatedAt=CURRENT_TIMESTAMP`,user.id,now+1,input.requestId,claim));
  statements.push(guarded('DELETE FROM SecurityToken WHERE userId=?',[user.id]));
  statements.push(guarded('DELETE FROM UserSecurityState WHERE userId=?',[user.id]));
  statements.push(guarded(`DELETE FROM ApiMutation WHERE (credentialId IN (SELECT id FROM ApiCredential WHERE createdById=?) OR EXISTS (SELECT 1 FROM json_tree(responseJson) j WHERE j.type='text' AND j.value=?))`,[user.id,user.id]));
  statements.push(guarded('DELETE FROM ApiCredentialPolicy WHERE credentialId IN (SELECT id FROM ApiCredential WHERE createdById=?)',[user.id]));
  statements.push(guarded('DELETE FROM ApiCredential WHERE createdById=?',[user.id]));
  statements.push(guarded('DELETE FROM EmailOutbox WHERE lower(recipient)=lower(?)',[user.email]));
  // Cancel saved deliveries carrying this account's data before deleting the
  // referenced invitations. In-flight receiver requests cannot be recalled.
  statements.push(guarded(`DELETE FROM WebhookOutbox WHERE EXISTS (SELECT 1 FROM json_tree(payloadJson) j
    WHERE j.type='text' AND (j.value=? OR lower(j.value)=lower(?) OR j.value IN (SELECT id FROM Invitation WHERE lower(email)=lower(?))))`,[user.id,user.email,user.email]));
  statements.push(guarded('DELETE FROM Invitation WHERE lower(email)=lower(?)',[user.email]));
  statements.push(guarded('DELETE FROM MigrationMemberState WHERE lower(email)=lower(?)',[user.email]));
  statements.push(guarded(`UPDATE WorkflowSubmission SET name='Removed account',email='removed+'||id||'@deleted.invalid',
    phone=NULL,company=NULL,notes=NULL,answersJson='{}' WHERE lower(email)=lower(?)`,[user.email]));
  statements.push(guarded("UPDATE Activity SET actorId=NULL,message='Activity from a removed account' WHERE actorId=?",[user.id]));
  statements.push(guarded("UPDATE Activity SET message='Activity involving a removed account' WHERE instr(lower(message),lower(?))>0",[user.email]));
  statements.push(guarded('DELETE FROM CreditLedger WHERE userId=?',[user.id]));
  statements.push(guarded('DELETE FROM EventAttendance WHERE userId=?',[user.id]));
  if (tables.has('SocialOnboardingTicket')) statements.push(guarded('DELETE FROM SocialOnboardingTicket WHERE lower(email)=lower(?)',[user.email]));
  if (tables.has('SocialIdentity')) {
    statements.push(guarded("DELETE FROM AppleRevocationToken WHERE providerSubject IN (SELECT providerSubject FROM SocialIdentity WHERE userId=? AND provider='apple')",[user.id]));
    statements.push(guarded('DELETE FROM SocialIdentity WHERE userId=?',[user.id]));
  }
  statements.push(guarded('DELETE FROM User WHERE id=?',[user.id])); // Core child records cascade.
  const confirmation = `Account removal completed. De-identified training history expires on ${new Date(expiresAt).toISOString().slice(0,10)} and is automatically purged after that date.`;
  statements.push(guarded(`UPDATE AccountDeletionReview SET message=CASE WHEN (SELECT scope FROM AccountDeletionRequest WHERE id=AccountDeletionReview.requestId)='ORGANIZATION' THEN 'Account removed; workspace closure was not performed.' ELSE ? END WHERE requestId IN
    (SELECT id FROM AccountDeletionRequest WHERE userId=?)`,[confirmation,user.id]));
  statements.push(guarded(`UPDATE AccountDeletionReceipt SET expiresAt=? WHERE requestId IN
    (SELECT id FROM AccountDeletionRequest WHERE userId=?)`,[expiresAt+30*86400000,user.id]));
  statements.push(guarded(`UPDATE AccountDeletionRequest SET status=CASE
    WHEN scope='ACCOUNT' AND status IN ('PENDING','UNDER_REVIEW','NEEDS_INFORMATION') THEN 'COMPLETED'
    WHEN scope='ORGANIZATION' AND status IN ('PENDING','UNDER_REVIEW','NEEDS_INFORMATION') THEN 'CANCELLED' ELSE status END,
    resolvedAt=CURRENT_TIMESTAMP,resolutionNote=CASE WHEN scope='ORGANIZATION' THEN 'Account removed; workspace closure was not performed.' ELSE ? END,userId='removed' WHERE userId=?`,[confirmation,user.id]));
  statements.push(guarded(`UPDATE AccountDeletionExecution SET completedAt=? WHERE requestId=?
    AND NOT EXISTS (SELECT 1 FROM User WHERE id=?)`,[now,input.requestId,user.id]));
  const results = await db.batch(statements);
  if (!results[0].meta.changes) throw new DeletionBlocked('The request or ownership changed. Refresh the preview and review it again.');
  return { completedAt:now,trainingExpiresAt:expiresAt };
}
