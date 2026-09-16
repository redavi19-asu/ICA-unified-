-- ICA Unified production hardening / auxiliary-table baseline.
CREATE TABLE IF NOT EXISTS OrganizationBillingProfile (
  organizationId TEXT PRIMARY KEY NOT NULL,
  plan TEXT NOT NULL DEFAULT 'professional',
  priceCents INTEGER NOT NULL DEFAULT 29900,
  currency TEXT NOT NULL DEFAULT 'usd',
  subscriptionStatus TEXT NOT NULL DEFAULT 'NOT_CONNECTED',
  provider TEXT NOT NULL DEFAULT 'STRIPE',
  providerCustomerId TEXT,
  providerSubscriptionId TEXT,
  updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS EmailOutbox (
  id TEXT PRIMARY KEY NOT NULL, organizationId TEXT NOT NULL, recipient TEXT NOT NULL,
  subject TEXT NOT NULL, templateKey TEXT NOT NULL, bodyText TEXT NOT NULL,
  payloadJson TEXT NOT NULL DEFAULT '{}', status TEXT NOT NULL DEFAULT 'QUEUED',
  providerMessageId TEXT, lastError TEXT, createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, sentAt TEXT
);
CREATE INDEX IF NOT EXISTS EmailOutbox_org_status ON EmailOutbox (organizationId, status, createdAt);
CREATE TABLE IF NOT EXISTS ApiCredential (
  id TEXT PRIMARY KEY NOT NULL, organizationId TEXT NOT NULL, name TEXT NOT NULL,
  keyPrefix TEXT NOT NULL, keyHash TEXT NOT NULL UNIQUE, active INTEGER NOT NULL DEFAULT 1,
  createdById TEXT, createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, lastUsedAt TEXT
);
CREATE INDEX IF NOT EXISTS ApiCredential_org_active ON ApiCredential (organizationId, active);
CREATE TABLE IF NOT EXISTS WebhookEndpoint (
  id TEXT PRIMARY KEY NOT NULL, organizationId TEXT NOT NULL, url TEXT NOT NULL, secret TEXT NOT NULL,
  eventTypesJson TEXT NOT NULL DEFAULT '["*"]', active INTEGER NOT NULL DEFAULT 1,
  createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, lastDeliveryAt TEXT, lastStatus INTEGER, lastError TEXT
);
CREATE INDEX IF NOT EXISTS WebhookEndpoint_org_active ON WebhookEndpoint (organizationId, active);
CREATE TABLE IF NOT EXISTS WebhookDelivery (
  id TEXT PRIMARY KEY NOT NULL, organizationId TEXT NOT NULL, endpointId TEXT NOT NULL,
  eventType TEXT NOT NULL, responseStatus INTEGER, success INTEGER NOT NULL DEFAULT 0,
  error TEXT, createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS WebhookDelivery_org_created ON WebhookDelivery (organizationId, createdAt);
CREATE TABLE IF NOT EXISTS CustomDomain (
  organizationId TEXT PRIMARY KEY NOT NULL, hostname TEXT NOT NULL UNIQUE,
  verificationToken TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'PENDING',
  verifiedAt TEXT, updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS WorkflowDefinition (
  id TEXT PRIMARY KEY NOT NULL, organizationId TEXT NOT NULL, kind TEXT NOT NULL,
  name TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'DRAFT', configJson TEXT NOT NULL,
  createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS WorkflowDefinition_org_kind ON WorkflowDefinition (organizationId, kind);
CREATE TABLE IF NOT EXISTS MigrationMemberState (
  id TEXT PRIMARY KEY NOT NULL, organizationId TEXT NOT NULL, email TEXT NOT NULL,
  desiredRole TEXT NOT NULL DEFAULT 'MEMBER', desiredStatus TEXT NOT NULL DEFAULT 'ACTIVE',
  jobTitle TEXT, sourceRow INTEGER, createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE (organizationId, email)
);
CREATE INDEX IF NOT EXISTS MigrationMemberState_org_email ON MigrationMemberState (organizationId, email);
CREATE TABLE IF NOT EXISTS CourseCreditRule (
  courseId TEXT PRIMARY KEY NOT NULL, organizationId TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'GENERAL', credits REAL NOT NULL DEFAULT 0,
  updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS CourseCreditRule_org_category ON CourseCreditRule (organizationId, category);
CREATE TABLE IF NOT EXISTS CreditLedger (
  id TEXT PRIMARY KEY NOT NULL, organizationId TEXT NOT NULL, userId TEXT NOT NULL,
  sourceType TEXT NOT NULL, sourceId TEXT NOT NULL, category TEXT NOT NULL DEFAULT 'GENERAL',
  credits REAL NOT NULL DEFAULT 0, description TEXT NOT NULL,
  awardedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (organizationId, userId, sourceType, sourceId)
);
CREATE INDEX IF NOT EXISTS CreditLedger_org_user ON CreditLedger (organizationId, userId, awardedAt);
CREATE TABLE IF NOT EXISTS ComplianceRequirement (
  id TEXT PRIMARY KEY NOT NULL, organizationId TEXT NOT NULL, name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'GENERAL', requiredCredits REAL NOT NULL DEFAULT 0,
  renewalDate TEXT, active INTEGER NOT NULL DEFAULT 1,
  createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ComplianceRequirement_org_active ON ComplianceRequirement (organizationId, active);
CREATE TABLE IF NOT EXISTS EventCheckinToken (
  token TEXT PRIMARY KEY NOT NULL, organizationId TEXT NOT NULL, workflowId TEXT NOT NULL,
  expiresAt TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1,
  createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS EventCheckinToken_org_workflow ON EventCheckinToken (organizationId, workflowId);
CREATE TABLE IF NOT EXISTS EventAttendance (
  id TEXT PRIMARY KEY NOT NULL, organizationId TEXT NOT NULL, workflowId TEXT NOT NULL,
  userId TEXT NOT NULL, checkedInAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (organizationId, workflowId, userId)
);
CREATE INDEX IF NOT EXISTS EventAttendance_org_user ON EventAttendance (organizationId, userId, checkedInAt);
CREATE TABLE IF NOT EXISTS UserSecurityState (
  userId TEXT PRIMARY KEY NOT NULL,
  emailVerifiedAt INTEGER,
  createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS SecurityToken (
  id TEXT PRIMARY KEY NOT NULL, userId TEXT NOT NULL, purpose TEXT NOT NULL,
  tokenHash TEXT NOT NULL UNIQUE, expiresAt INTEGER NOT NULL, usedAt INTEGER,
  createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS SecurityToken_user_purpose ON SecurityToken (userId, purpose, expiresAt);
CREATE TABLE IF NOT EXISTS RateLimitBucket (
  bucketKey TEXT PRIMARY KEY NOT NULL, count INTEGER NOT NULL DEFAULT 0,
  resetAt INTEGER NOT NULL, updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
