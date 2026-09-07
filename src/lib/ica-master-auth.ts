import { getCloudflareContext } from '@opennextjs/cloudflare';

const encoder = new TextEncoder();

type IcaMasterRow = {
  id: string;
  email: string;
  display_name: string | null;
  role: string;
  status: string;
  password_hash: string;
  password_salt: string;
};

export type IcaMasterOwner = {
  id: string;
  email: string;
  displayName: string;
  role: 'owner';
};

function hexToBytes(hex: string) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function constantTimeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let index = 0; index < a.length; index += 1) {
    mismatch |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return mismatch === 0;
}

async function hashPassword(password: string, saltHex: string) {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );

  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt: hexToBytes(saltHex),
      iterations: 100000,
    },
    key,
    256
  );

  return bytesToHex(new Uint8Array(bits));
}

export async function authenticateIcaMasterOwner(
  email: string,
  password: string
): Promise<IcaMasterOwner | null> {
  const { env } = getCloudflareContext();
  const db = (env as any).ICA_DB;

  if (!db || !email || !password) return null;

  const row = await db
    .prepare(
      `SELECT
        id,
        email,
        display_name,
        role,
        status,
        password_hash,
        password_salt
      FROM users
      WHERE email = ?
      LIMIT 1`
    )
    .bind(email.trim().toLowerCase())
    .first<IcaMasterRow>();

  if (!row || row.role !== 'owner' || row.status !== 'active') return null;

  const suppliedHash = await hashPassword(password, row.password_salt);
  if (!constantTimeEqual(suppliedHash, row.password_hash)) return null;

  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name || 'ICA Master Owner',
    role: 'owner',
  };
}
