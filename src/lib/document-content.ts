import { prisma } from './prisma';

export type ControlledDocumentContent = {
  documentId: string;
  organizationId: string;
  bodyText: string | null;
  storageKey: string | null;
  fileName: string | null;
  contentType: string | null;
  updatedAt: string;
};

let tableReady: Promise<void> | null = null;

export async function ensureDocumentContentTable() {
  if (!tableReady) {
    tableReady = (async () => {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS DocumentContent (
          documentId TEXT PRIMARY KEY NOT NULL,
          organizationId TEXT NOT NULL,
          bodyText TEXT,
          storageKey TEXT,
          fileName TEXT,
          contentType TEXT,
          updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `);
      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS DocumentContent_org
        ON DocumentContent (organizationId, documentId)
      `);
    })().catch((error) => {
      tableReady = null;
      throw error;
    });
  }
  return tableReady;
}

export async function upsertDocumentText(
  organizationId: string,
  documentId: string,
  bodyText: string | null,
) {
  await ensureDocumentContentTable();
  await prisma.$executeRawUnsafe(
    `INSERT INTO DocumentContent
      (documentId, organizationId, bodyText, storageKey, fileName, contentType, updatedAt)
     VALUES (?, ?, ?, NULL, NULL, NULL, CURRENT_TIMESTAMP)
     ON CONFLICT(documentId) DO UPDATE SET
       bodyText = excluded.bodyText,
       updatedAt = CURRENT_TIMESTAMP`,
    documentId,
    organizationId,
    bodyText || null,
  );
}

export async function attachDocumentFile(input: {
  organizationId: string;
  documentId: string;
  storageKey: string;
  fileName: string;
  contentType: string;
}) {
  await ensureDocumentContentTable();
  await prisma.$executeRawUnsafe(
    `INSERT INTO DocumentContent
      (documentId, organizationId, bodyText, storageKey, fileName, contentType, updatedAt)
     VALUES (?, ?, NULL, ?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(documentId) DO UPDATE SET
       storageKey = excluded.storageKey,
       fileName = excluded.fileName,
       contentType = excluded.contentType,
       updatedAt = CURRENT_TIMESTAMP`,
    input.documentId,
    input.organizationId,
    input.storageKey,
    input.fileName,
    input.contentType,
  );
}

export async function getDocumentContent(organizationId: string, documentId: string) {
  await ensureDocumentContentTable();
  const rows = await prisma.$queryRawUnsafe<ControlledDocumentContent[]>(
    `SELECT documentId, organizationId, bodyText, storageKey, fileName, contentType, updatedAt
     FROM DocumentContent
     WHERE organizationId = ? AND documentId = ?
     LIMIT 1`,
    organizationId,
    documentId,
  );
  return rows[0] || null;
}

export async function listDocumentContent(organizationId: string, documentIds: string[]) {
  await ensureDocumentContentTable();
  if (!documentIds.length) return [] as ControlledDocumentContent[];

  const rows = await prisma.$queryRawUnsafe<ControlledDocumentContent[]>(
    `SELECT documentId, organizationId, bodyText, storageKey, fileName, contentType, updatedAt
     FROM DocumentContent
     WHERE organizationId = ?`,
    organizationId,
  );
  const wanted = new Set(documentIds);
  return rows.filter((row) => wanted.has(row.documentId));
}
