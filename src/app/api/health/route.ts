import { NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import {
  ensureUnifiedRuntimeSchema,
  REQUIRED_APPLICATION_TABLES,
} from '../../../lib/runtime-schema';

async function checkRequiredTables(db: any, expected: readonly string[]) {
  if (!db) {
    return { bound: false, ready: false, missing: [...expected] };
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
      missing,
    };
  } catch (error) {
    console.error('ICA_UNIFIED_D1_SCHEMA_ERROR', error);
    return { bound: true, ready: false, missing: [...expected] };
  }
}

export async function GET() {
  try {
    const { env } = getCloudflareContext();
    const bindings = env as any;

    let applicationDatabase = await checkRequiredTables(
      bindings.DB,
      REQUIRED_APPLICATION_TABLES,
    );

    // A healthy Worker binding is authoritative for ICA Unified runtime schema.
    // If an auxiliary table is missing, create the idempotent runtime schema
    // through that binding, then verify the full required table set again.
    if (applicationDatabase.bound && !applicationDatabase.ready) {
      try {
        await ensureUnifiedRuntimeSchema();
      } catch (error) {
        console.error('ICA_UNIFIED_RUNTIME_SCHEMA_BOOTSTRAP_ERROR', error);
      }

      applicationDatabase = await checkRequiredTables(
        bindings.DB,
        REQUIRED_APPLICATION_TABLES,
      );
    }

    const serviceReady = applicationDatabase.ready;

    if (!serviceReady) {
      console.error('ICA_UNIFIED_HEALTH_NOT_READY', {
        databaseBound: applicationDatabase.bound,
        missing: applicationDatabase.missing,
      });
    }

    // Keep the public response intentionally minimal. Detailed schema/binding
    // diagnostics stay in server logs instead of being exposed to visitors.
    return NextResponse.json(
      { ok: serviceReady, service: 'ICA Unified' },
      { status: serviceReady ? 200 : 503, headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    console.error('ICA_UNIFIED_HEALTH_ERROR', error);
    return NextResponse.json(
      { ok: false, service: 'ICA Unified' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
