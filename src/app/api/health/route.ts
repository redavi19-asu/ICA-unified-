import { NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';

const REQUIRED_APPLICATION_TABLES = [
  'Organization',
  'User',
  'Membership',
  'Course',
  'Enrollment',
  'Credential',
  'Document',
  'WorkflowDefinition',
  'OrganizationBillingProfile',
  'EmailOutbox',
  'CustomDomain',
  'UserSecurityState',
  'RateLimitBucket',
];

async function checkRequiredTables(db: any, expected: string[]) {
  if (!db) {
    return { bound: false, ready: false, missing: expected };
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
    return { bound: true, ready: false, missing: expected };
  }
}

export async function GET() {
  try {
    const { env } = getCloudflareContext();
    const bindings = env as any;
    const applicationDatabase = await checkRequiredTables(bindings.DB, REQUIRED_APPLICATION_TABLES);
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
      {
        ok: serviceReady,
        serviceReady,
        service: 'ICA Unified',
        databaseReady: applicationDatabase.ready,
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
        databaseReady: false,
      },
      { status: 503 },
    );
  }
}
