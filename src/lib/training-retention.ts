import { randomUUID } from 'node:crypto';

export interface TrainingArchiveDatabase {
  run(sql: string, ...values: (string | number | null)[]): Promise<number>;
}
export const TRAINING_ARCHIVE_SCHEMA = `CREATE TABLE IF NOT EXISTS AccountTrainingArchive (
  id TEXT PRIMARY KEY NOT NULL,
  organizationId TEXT NOT NULL,
  recordsJson TEXT NOT NULL,
  createdAt INTEGER NOT NULL,
  expiresAt INTEGER NOT NULL
)`;
export const TRAINING_ARCHIVE_EXPIRY_INDEX = 'CREATE INDEX IF NOT EXISTS AccountTrainingArchive_expiry ON AccountTrainingArchive (expiresAt)';

export type TrainingSnapshot = {
  acknowledgments?: Array<{ documentId: string; acknowledgedAt: string | null }>;
  courses: Array<{ courseId: string; status: string; progress: number; score: number | null; completedAt: string | null }>;
  credentials: Array<{ courseId: string | null; status: string; issuedAt: string | null; expiresAt: string | null }>;
  credits: Array<{ sourceType: string; sourceId: string; credits: number; awardedAt: string }>;
};
function date(value: string | null) {
  if (value === null) return null;
  const time = Date.parse(value);
  if (!Number.isFinite(time)) throw new Error('Invalid training record date');
  return new Date(time).toISOString();
}
function identifier(value: string) {
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(value)) throw new Error('Invalid training record identifier');
  return value;
}
function number(value: number, min: number, max: number) {
  if (!Number.isFinite(value) || value < min || value > max) throw new Error('Invalid training record value');
  return value;
}
/** Retain only structured training facts, never login/profile fields, certificate
 * codes, free-text quiz answers, notes, or the original account/request ID. */
export function serializeTrainingSnapshot(input: TrainingSnapshot) {
  const records = {
    version: 1,
    acknowledgments: (input.acknowledgments || []).map(row => ({ documentId: identifier(row.documentId), acknowledgedAt: date(row.acknowledgedAt) })),
    courses: input.courses.map(row => ({
      courseId: identifier(row.courseId),
      status: ['NOT_STARTED','IN_PROGRESS','COMPLETE'].includes(row.status) ? row.status : 'OTHER',
      progress: number(row.progress, 0, 100), score: row.score === null ? null : number(row.score, 0, 100),
      completedAt: date(row.completedAt),
    })),
    credentials: input.credentials.map(row => ({
      courseId: row.courseId === null ? null : identifier(row.courseId),
      status: ['active','expired','revoked'].includes(row.status.toLowerCase()) ? row.status.toLowerCase() : 'other',
      issuedAt: date(row.issuedAt), expiresAt: date(row.expiresAt),
    })),
    credits: input.credits.map(row => ({
      sourceType: ['COURSE','EVENT'].includes(row.sourceType.toUpperCase()) ? row.sourceType.toUpperCase() : 'OTHER',
      sourceId: identifier(row.sourceId), credits: number(row.credits, 0, 1_000_000), awardedAt: date(row.awardedAt),
    })),
  };
  const encoded = JSON.stringify(records);
  if (Buffer.byteLength(encoded, 'utf8') > 1_000_000) throw new Error('Training archive exceeds its size limit');
  return encoded;
}

export async function ensureTrainingArchive(db: TrainingArchiveDatabase) {
  await db.run(TRAINING_ARCHIVE_SCHEMA);
  await db.run(TRAINING_ARCHIVE_EXPIRY_INDEX);
}
export async function saveTrainingArchive(db: TrainingArchiveDatabase, input: {
  organizationId: string; records: TrainingSnapshot; retentionDays: number;
}, now = Date.now()) {
  // Retention must be explicitly supplied by the selected policy. No unlimited
  // or implicit duration is accepted, and no production default is chosen here.
  if (!Number.isInteger(input.retentionDays) || input.retentionDays < 1 || input.retentionDays > 3650) {
    throw new Error('An explicit bounded retention period is required');
  }
  const recordsJson = serializeTrainingSnapshot(input.records);
  const id = randomUUID();
  const expiresAt = now + input.retentionDays * 24 * 60 * 60_000;
  await ensureTrainingArchive(db);
  await db.run('INSERT INTO AccountTrainingArchive (id,organizationId,recordsJson,createdAt,expiresAt) VALUES (?,?,?,?,?)',
    id, input.organizationId, recordsJson, now, expiresAt);
  return { id, expiresAt };
}
export async function purgeExpiredTrainingArchives(db: TrainingArchiveDatabase, now = Date.now(), limit = 100) {
  await ensureTrainingArchive(db);
  const removed = await db.run(`DELETE FROM AccountTrainingArchive WHERE id IN (
    SELECT id FROM AccountTrainingArchive WHERE expiresAt <= ? ORDER BY expiresAt LIMIT ?
  )`, now, Math.max(1, Math.min(limit, 100)));
  return { removed };
}
