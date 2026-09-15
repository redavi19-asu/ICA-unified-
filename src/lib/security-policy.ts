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
