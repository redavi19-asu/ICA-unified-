import { NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';

export async function GET() {
  let applicationDatabaseReady = false;
  let centralDatabaseReady = false;
  let centralUserCount: number | null = null;

  try {
    const { env } = getCloudflareContext();
    const bindings = env as any;

    try {
      if (bindings.DB) {
        const row = await bindings.DB
          .prepare('SELECT 1 AS ok')
          .first();

        applicationDatabaseReady = Number(row?.ok || 0) === 1;
      }
    } catch (error) {
      console.error('ICA_UNIFIED_APP_DB_HEALTH_ERROR', error);
    }

    try {
      if (bindings.ICA_DB) {
        const row = await bindings.ICA_DB
          .prepare('SELECT COUNT(*) AS count FROM users')
          .first();

        centralUserCount = Number(row?.count || 0);
        centralDatabaseReady = true;
      }
    } catch (error) {
      console.error('ICA_UNIFIED_CENTRAL_DB_HEALTH_ERROR', error);
    }

    const healthy =
      Boolean(bindings.DB) &&
      Boolean(bindings.ICA_DB) &&
      applicationDatabaseReady &&
      centralDatabaseReady;

    return NextResponse.json(
      {
        ok: healthy,
        service: 'ICA Unified',
        databaseBound: Boolean(bindings.DB),
        databaseReady: applicationDatabaseReady,
        centralDatabaseBound: Boolean(bindings.ICA_DB),
        centralDatabaseReady,
        centralUserCount,
      },
      { status: healthy ? 200 : 503 }
    );
  } catch (error) {
    console.error('ICA_UNIFIED_HEALTH_ERROR', error);

    return NextResponse.json(
      {
        ok: false,
        service: 'ICA Unified',
        databaseBound: false,
        databaseReady: false,
        centralDatabaseBound: false,
        centralDatabaseReady: false,
        centralUserCount,
      },
      { status: 503 }
    );
  }
}
