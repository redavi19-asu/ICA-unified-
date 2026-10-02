/** Sign Apple's short-lived client assertion on demand using a server-only key. */
export function appleSigningConfigured(env: Record<string, unknown>) {
  return ['SOCIAL_APPLE_TEAM_ID', 'SOCIAL_APPLE_KEY_ID', 'SOCIAL_APPLE_PRIVATE_KEY']
    .every(name => Boolean(String(env[name] || '').trim()));
}

function base64url(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

export async function appleClientSecret(env: Record<string, unknown>, clientId: string) {
  if (!appleSigningConfigured(env) || !clientId) throw new Error('Apple sign-in signing credentials are not configured.');
  try {
    const pem = String(env.SOCIAL_APPLE_PRIVATE_KEY).replace(/\\n/g, '\n');
    const body = pem.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, '');
    const der = Uint8Array.from(atob(body), char => char.charCodeAt(0));
    const key = await crypto.subtle.importKey('pkcs8', der, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
    const now = Math.floor(Date.now() / 1000);
    const encode = (value: Record<string, unknown>) => base64url(new TextEncoder().encode(JSON.stringify(value)));
    const header = encode({ alg: 'ES256', kid: String(env.SOCIAL_APPLE_KEY_ID).trim() });
    const payload = encode({ iss: String(env.SOCIAL_APPLE_TEAM_ID).trim(), iat: now, exp: now + 300, aud: 'https://appleid.apple.com', sub: clientId });
    const input = `${header}.${payload}`;
    const signature = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(input));
    return `${input}.${base64url(new Uint8Array(signature))}`;
  } catch {
    throw new Error('Apple sign-in signing credentials are invalid.');
  }
}
