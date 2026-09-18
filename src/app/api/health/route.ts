import { NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';

async function checkIntegrity(db: any) {
  if (!db) return { bound: false, ready: false, integrity: 'unbound', tables: [] as string[] };

  try {
    const integrityRow = await db.prepare('PRAGMA integrity_check').first();
    const integrityValue = String(
      integrityRow?.integrity_check ??
      integrityRow?.['PRAGMA integrity_check'] ??
      Object.values(integrityRow || {})[0] ??
      '',
    ).toLowerCase();

    return {
      bound: true,
      ready: integrityValue === 'ok',
      integrity: integrityValue || 'unknown',
      tables: [] as string[],
    };
  } catch (error) {
    console.error('ICA_UNIFIED_D1_INTEGRITY_ERROR', error);
    return { bound: true, ready: false, integrity: 'error', tables: [] as string[] };
  }
}

async function checkTables(db: any, expected: string[]) {
  if (!db) return { present: [] as string[], missing: expected };

  try {
    const placeholders = expected.map(() => '?').join(',');
    const result = await db
      .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name IN (${placeholders}) ORDER BY name`)
      .bind(...expected)
      .all();

    const present = (result?.results || []).map((row: any) => String(row.name));
    return {
      present,
      missing: expected.filter((name) => !present.includes(name)),
    };
  } catch (error) {
    console.error('ICA_UNIFIED_D1_SCHEMA_ERROR', error);
    return { present: [] as string[], missing: expected };
  }
}

export async function GET() {
  try {
    const { env } = getCloudflareContext();
    const bindings = env as any;

    const appExpectedTables = ['Organization', 'User', 'Membership', 'Course'];
    const centralExpectedTables = ['users'];

    const [appIntegrity, centralIntegrity, appSchema, centralSchema] = await Promise.all([
      checkIntegrity(bindings.DB),
      checkIntegrity(bindings.ICA_DB),
      checkTables(bindings.DB, appExpectedTables),
      checkTables(bindings.ICA_DB, centralExpectedTables),
    ]);

    const applicationDatabaseReady =
      appIntegrity.bound &&
      appIntegrity.ready &&
      appSchema.missing.length === 0;

    const centralDatabaseReady =
      centralIntegrity.bound &&
      centralIntegrity.ready &&
      centralSchema.missing.length === 0;

    const healthy = applicationDatabaseReady && centralDatabaseReady;

    return NextResponse.json(
      {
        ok: healthy,
        service: 'ICA Unified',
        databaseBound: appIntegrity.bound,
        databaseReady: applicationDatabaseReady,
        databaseIntegrity: appIntegrity.integrity,
        databaseMissingTables: appSchema.missing,
        centralDatabaseBound: centralIntegrity.bound,
        centralDatabaseReady,
        centralDatabaseIntegrity: centralIntegrity.integrity,
        centralDatabaseMissingTables: centralSchema.missing,
      },
      { status: healthy ? 200 : 503 },
    );
  } catch (error) {
    console.error('ICA_UNIFIED_HEALTH_ERROR', error);
    return NextResponse.json(
      {
        ok: false,
        service: 'ICA Unified',
        databaseBound: false,
        databaseReady: false,
        databaseIntegrity: 'error',
        databaseMissingTables: [],
        centralDatabaseBound: false,
        centralDatabaseReady: false,
        centralDatabaseIntegrity: 'error',
        centralDatabaseMissingTables: [],
      },
      { status: 503 },
    );
  }
}
