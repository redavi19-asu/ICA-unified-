import { ensureApiKeyTables } from './api-keys';
import { ensureComplianceTables } from './compliance';
import { ensureOperationsTables } from './organization-ops';
import { prisma } from './prisma';
import { ensureSecurityTables } from './security';
import { ensureWorkflowExecutionTables } from './workflow-execution';

export const REQUIRED_APPLICATION_TABLES = [
  'Organization',
  'User',
  'Membership',
  'Course',
  'Enrollment',
  'Credential',
  'Document',
  'OrganizationBillingProfile',
  'EmailOutbox',
  'ApiCredential',
  'WebhookEndpoint',
  'WebhookDelivery',
  'CustomDomain',
  'WorkflowDefinition',
  'WorkflowSubmission',
  'MigrationMemberState',
  'CourseCreditRule',
  'CreditLedger',
  'ComplianceRequirement',
  'EventCheckinToken',
  'EventAttendance',
  'UserSecurityState',
  'SecurityToken',
  'RateLimitBucket',
  'PrincipalSessionState',
  'RevokedSession',
  'ApiCredentialPolicy',
] as const;

let runtimeSchemaReady: Promise<void> | null = null;

async function ensureStandaloneRuntimeTables() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS WorkflowDefinition (
      id TEXT PRIMARY KEY NOT NULL,
      organizationId TEXT NOT NULL,
      kind TEXT NOT NULL,
      name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'DRAFT',
      configJson TEXT NOT NULL,
      createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS WorkflowDefinition_org_kind
    ON WorkflowDefinition (organizationId, kind)
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS MigrationMemberState (
      id TEXT PRIMARY KEY NOT NULL,
      organizationId TEXT NOT NULL,
      email TEXT NOT NULL,
      desiredRole TEXT NOT NULL DEFAULT 'MEMBER',
      desiredStatus TEXT NOT NULL DEFAULT 'ACTIVE',
      jobTitle TEXT,
      sourceRow INTEGER,
      createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (organizationId, email)
    )
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS MigrationMemberState_org_email
    ON MigrationMemberState (organizationId, email)
  `);
}

/**
 * Ensures every auxiliary D1 table required by the deployed ICA Unified runtime
 * exists through the Worker's bound database connection.
 *
 * This deliberately uses the runtime DB binding instead of the Cloudflare D1
 * control-plane API. The Worker already needs DB access to serve the product,
 * while deploy tokens do not need broad D1 account-management permission.
 */
export async function ensureUnifiedRuntimeSchema() {
  if (!runtimeSchemaReady) {
    runtimeSchemaReady = (async () => {
      await ensureOperationsTables();
      await ensureApiKeyTables();
      await ensureSecurityTables();
      await ensureComplianceTables();
      await ensureWorkflowExecutionTables();
      await ensureStandaloneRuntimeTables();
    })().catch((error) => {
      runtimeSchemaReady = null;
      throw error;
    });
  }

  return runtimeSchemaReady;
}
