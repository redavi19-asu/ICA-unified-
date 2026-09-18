import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

function source(relativePath: string) {
  return readFileSync(new URL('../' + relativePath, import.meta.url), 'utf8');
}

test('user sessions have server revocation and a 24-hour lifetime', () => {
  const auth = source('src/lib/auth.ts');
  assert.match(auth, /setJti\(sessionId\)/);
  assert.match(auth, /setExpirationTime\('24h'\)/);
  assert.match(auth, /sessionIsValid/);
});

test('web logout revokes the exact session before clearing the cookie', () => {
  const logout = source('src/app/api/auth/logout/route.ts');
  assert.match(logout, /revokeSession/);
  assert.match(logout, /session\.sessionId/);
  assert.match(logout, /expires: new Date\(0\)/);
});

test('password reset invalidates every existing user session', () => {
  const reset = source('src/app/api/auth/reset-password/route.ts');
  assert.match(reset, /invalidatePrincipalSessions\('user', userId\)/);
});

test('platform sessions are shorter and independently revocable', () => {
  const platformAuth = source('src/lib/platform-auth.ts');
  assert.match(platformAuth, /setExpirationTime\('8h'\)/);
  assert.match(platformAuth, /scope: 'platform'/);
  assert.match(platformAuth, /sessionIsValid/);
});

test('platform login is protected by both rate limiting and Turnstile', () => {
  const login = source('src/app/api/platform/login/route.ts');
  assert.match(login, /scope: 'platform-login'/);
  assert.match(login, /limit: 5/);
  assert.match(login, /verifyTurnstile/);
});

test('member API requires separate read and write scopes', () => {
  const members = source('src/app/api/v1/members/route.ts');
  assert.match(members, /authenticateApiRequest\(request, 'members:read'\)/);
  assert.match(members, /authenticateApiRequest\(request, 'members:write'\)/);
});

test('API keys have policy-backed expiration and rate limiting', () => {
  const keys = source('src/lib/api-keys.ts');
  assert.match(keys, /ApiCredentialPolicy/);
  assert.match(keys, /expiresAt/);
  assert.match(keys, /requestsPerMinute/);
  assert.match(keys, /includeIp: false/);
});

test('public health endpoint does not expose database schema diagnostics', () => {
  const health = source('src/app/api/health/route.ts');
  assert.match(health, /\{ ok: serviceReady, service: 'ICA Unified' \}/);
  assert.doesNotMatch(health, /databaseMissingTables/);
  assert.doesNotMatch(health, /centralDatabaseMissingTables/);
});

test('content security policy does not allow unpkg or generic HTTPS connections', () => {
  const config = source('next.config.mjs');
  assert.doesNotMatch(config, /unpkg\.com/);
  assert.doesNotMatch(config, /connect-src 'self' https: wss:/);
  assert.match(config, /script-src-attr 'none'/);
});

test('mobile sign-out revokes the bearer token at the server', () => {
  const route = source('src/app/api/mobile/auth/logout/route.ts');
  const app = source('mobile/App.tsx');
  assert.match(route, /revokeSession/);
  assert.match(app, /await logout\(token\)/);
  assert.match(app, /deleteItemAsync\(TOKEN_KEY\)/);
});
