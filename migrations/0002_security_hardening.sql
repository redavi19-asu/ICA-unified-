-- ICA Unified session and API security hardening.
CREATE TABLE IF NOT EXISTS PrincipalSessionState (
  scope TEXT NOT NULL,
  principalId TEXT NOT NULL,
  invalidAfter INTEGER NOT NULL DEFAULT 0,
  updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (scope, principalId)
);

CREATE TABLE IF NOT EXISTS RevokedSession (
  sessionId TEXT PRIMARY KEY NOT NULL,
  scope TEXT NOT NULL,
  principalId TEXT NOT NULL,
  expiresAt INTEGER NOT NULL,
  revokedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS RevokedSession_expiry ON RevokedSession (expiresAt);

CREATE TABLE IF NOT EXISTS ApiCredentialPolicy (
  credentialId TEXT PRIMARY KEY NOT NULL,
  scopesJson TEXT NOT NULL,
  expiresAt INTEGER NOT NULL,
  requestsPerMinute INTEGER NOT NULL DEFAULT 120,
  updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ApiCredentialPolicy_expiry ON ApiCredentialPolicy (expiresAt);

INSERT OR IGNORE INTO ApiCredentialPolicy
  (credentialId, scopesJson, expiresAt, requestsPerMinute, updatedAt)
SELECT
  id,
  '["members:read","members:write"]',
  (CAST(strftime('%s','now') AS INTEGER) * 1000) + 7776000000,
  120,
  CURRENT_TIMESTAMP
FROM ApiCredential;
