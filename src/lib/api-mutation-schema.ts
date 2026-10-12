export const API_MUTATION_SCHEMA = `CREATE TABLE IF NOT EXISTS ApiMutation (
 id TEXT PRIMARY KEY, organizationId TEXT NOT NULL, credentialId TEXT NOT NULL,
 operation TEXT NOT NULL, tokenHash TEXT NOT NULL, bodyHash TEXT NOT NULL,
 responseJson TEXT NOT NULL, expiresAt INTEGER NOT NULL,
 UNIQUE(organizationId,credentialId,operation,tokenHash))`;
