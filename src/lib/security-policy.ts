export function isAdminRole(role: string) {
  return ['OWNER', 'ADMIN', 'MANAGER'].includes(role);
}

export function accountUnavailable(membershipStatus: string, organizationStatus: string) {
  return membershipStatus === 'SUSPENDED' || ['SUSPENDED', 'CANCELLED'].includes(organizationStatus);
}

export function memberCourseAllowed(role: string, published: boolean, enrolled: boolean) {
  return isAdminRole(role) || (role === 'MEMBER' && published && enrolled);
}

export function checkoutBlocked(subscriptionId: string | null | undefined, status: string) {
  const value = String(status || '').toLowerCase();
  const terminal = new Set(['', 'not_connected', 'canceled', 'incomplete_expired']);
  return Boolean(subscriptionId && !terminal.has(value)) || ['trialing', 'active'].includes(value);
}

export function sessionIssuedAfterInvalidation(issuedAtMs: number, invalidAfterMs: number | null | undefined) {
  if (!Number.isFinite(issuedAtMs) || issuedAtMs <= 0) return false;
  const cutoff = Number(invalidAfterMs || 0);
  return cutoff <= 0 || issuedAtMs >= cutoff;
}

export function apiScopeAllowed(scopes: string[], requiredScope: string) {
  return scopes.includes('*') || scopes.includes(requiredScope);
}

export function apiKeyExpired(expiresAtMs: number | null | undefined, nowMs = Date.now()) {
  const expiresAt = Number(expiresAtMs || 0);
  return expiresAt > 0 && expiresAt <= nowMs;
}
