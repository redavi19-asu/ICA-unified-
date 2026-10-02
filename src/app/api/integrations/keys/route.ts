import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSession } from '../../../../lib/auth';
import { createApiKey, listApiKeys, revokeApiKey } from '../../../../lib/api-keys';

const createSchema = z.object({
  name: z.string().trim().min(2).max(80),
  scopes: z.array(z.enum(['members:read', 'members:write'])).min(1).max(2).default(['members:read', 'members:write']),
  expiresInDays: z.number().int().min(1).max(365).default(90),
  requestsPerMinute: z.number().int().min(10).max(1000).default(120),
});

export async function GET() {
  const { membership } = await requireSession();
  if (!['OWNER', 'ADMIN'].includes(membership.role)) {
    return NextResponse.json({ error: 'Owner or admin access is required.' }, { status: 403 });
  }

  const keys = await listApiKeys(membership.organizationId);
  return NextResponse.json({
    keys: keys.map((key) => ({
      ...key,
      active: Boolean(key.active),
      displayKey: `${key.keyPrefix}••••••••••••••••`,
      expiresAt: new Date(key.expiresAt).toISOString(),
    })),
  });
}

export async function POST(request: Request) {
  const { membership } = await requireSession();
  if (!['OWNER', 'ADMIN'].includes(membership.role)) {
    return NextResponse.json({ error: 'Owner or admin access is required.' }, { status: 403 });
  }

  const parsed = createSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: 'Give this API key a name.' }, { status: 400 });
  }

  const key = await createApiKey({
    organizationId: membership.organizationId,
    createdById: membership.userId,
    name: parsed.data.name,
    scopes: parsed.data.scopes,
    expiresInDays: parsed.data.expiresInDays,
    requestsPerMinute: parsed.data.requestsPerMinute,
  });
  return NextResponse.json({
    key: {
      id: key.id,
      name: key.name,
      value: key.raw,
      keyPrefix: key.keyPrefix,
      scopes: key.scopes,
      expiresAt: new Date(key.expiresAt).toISOString(),
      requestsPerMinute: key.requestsPerMinute,
    },
    warning: 'Copy this key now. ICA stores only its hash and cannot show the full key again.',
  }, { status: 201 });
}

export async function DELETE(request: Request) {
  const { membership } = await requireSession();
  if (!['OWNER', 'ADMIN'].includes(membership.role)) {
    return NextResponse.json({ error: 'Owner or admin access is required.' }, { status: 403 });
  }

  const url = new URL(request.url);
  const id = url.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'API key id is required.' }, { status: 400 });

  await revokeApiKey(membership.organizationId, id);
  return NextResponse.json({ ok: true });
}
