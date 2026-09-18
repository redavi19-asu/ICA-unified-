const API_URL = process.env.EXPO_PUBLIC_ICA_API_URL || 'https://unified.icomputeranything.com';

async function request(path: string, token?: string, init: RequestInit = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers || {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'ICA Unified request failed.');
  return data;
}

export function login(email: string, password: string, organizationSlug: string) {
  return request('/api/mobile/auth/login', undefined, {
    method: 'POST',
    body: JSON.stringify({ email, password, organizationSlug }),
  });
}

export const logout = (token: string) => request('/api/mobile/auth/logout', token, { method: 'POST' });
export const getMe = (token: string) => request('/api/mobile/me', token);
export const getWallet = (token: string) => request('/api/mobile/wallet', token);
export const getNotifications = (token: string) => request('/api/mobile/notifications', token);
export const searchMembers = (token: string, query: string) =>
  request(`/api/mobile/members?q=${encodeURIComponent(query)}`, token);
export const getMemberQr = (token: string) => request('/api/mobile/member-qr', token);
export const getStaffEvents = (token: string) => request('/api/mobile/events', token);
export const staffCheckIn = (token: string, workflowId: string, memberToken: string) =>
  request('/api/mobile/staff-checkin', token, {
    method: 'POST',
    body: JSON.stringify({ workflowId, memberToken }),
  });
export const checkIn = (token: string, eventToken: string) =>
  request(`/api/mobile/checkin/${encodeURIComponent(eventToken)}`, token, { method: 'POST' });

export function extractCheckinToken(value: string) {
  try {
    const url = new URL(value);
    const parts = url.pathname.split('/').filter(Boolean);
    const index = parts.indexOf('checkin');
    if (index >= 0 && parts[index + 1]) return parts[index + 1];
  } catch {}
  return value.trim();
}

export function extractMemberQrToken(value: string) {
  try {
    const url = new URL(value);
    const parts = url.pathname.split('/').filter(Boolean);
    if (url.protocol === 'icaunified:' && url.hostname === 'member' && parts[0]) return parts[0];
    const index = parts.indexOf('member');
    if (index >= 0 && parts[index + 1]) return parts[index + 1];
  } catch {}
  return value.trim();
}
