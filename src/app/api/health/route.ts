import { NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';

async function checkRequiredTables(db: any, expected: string[]) {
  if (!db) {
    return { bound: false, ready: false, present: [] as string[], missing: expected };
  }

  try {
    const placeholders = expected.map(() => '?').join(',');
    const result = await db
      .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name IN (${placeholders}) ORDER BY name`)
      .bind(...expected)
      .all();

    const present = (result?.results || []).map((row: any) => String(row.name));
    const missing = expected.filter((name) => !present.includes(name));

    return {
      bound: true,
      ready: missing.length === 0,
      present,
      missing,
    };
  } catch (error) {
    console.error('ICA_UNIFIED_D1_SCHEMA_ERROR', error);
    return { bound: true, ready: false, present: [] as string[], missing: expected };
  }
}

export async function GET() {
  try {
    const { env } = getCloudflareContext();
    const bindings = env as any;

    const [applicationDatabase, centralDatabase] = await Promise.all([
      checkRequiredTables(bindings.DB, ['Organization', 'User', 'Membership']),
      checkRequiredTables(bindings.ICA_DB, ['users']),
    ]);

    // Unified's public/customer service depends on its own application D1.
    // ICA_DB is the separate ICA master/control-plane database and is reported
    // independently so a central admin issue does not falsely mark Unified offline.
    const serviceReady = applicationDatabase.ready;

    return NextResponse.json(
      {
        ok: serviceReady,
        serviceReady,
        service: 'ICA Unified',
        databaseBound: applicationDatabase.bound,
        databaseReady: applicationDatabase.ready,
        databaseMissingTables: applicationDatabase.missing,
        centralDatabaseBound: centralDatabase.bound,
        centralDatabaseReady: centralDatabase.ready,
        centralDatabaseMissingTables: centralDatabase.missing,
        centralDatabaseRequiredForPublicService: false,
      },
      { status: serviceReady ? 200 : 503 },
    );
  } catch (error) {
    console.error('ICA_UNIFIED_HEALTH_ERROR', error);
    return NextResponse.json(
      {
        ok: false,
        serviceReady: false,
        service: 'ICA Unified',
        databaseBound: false,
        databaseReady: false,
        databaseMissingTables: [],
        centralDatabaseBound: false,
        centralDatabaseReady: false,
        centralDatabaseMissingTables: [],
        centralDatabaseRequiredForPublicService: false,
      },
      { status: 503 },
    );
  }
}
