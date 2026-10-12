import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSession } from '../../../../lib/auth';
import { createApiKey, listApiKeys, revokeApiKey } from '../../../../lib/api-keys';

import {apiRevenueDatabase} from '../../../../lib/api-revenue-database';
import {apiRevenueRequired,apiRevenueStatus} from '../../../../lib/api-revenue';
import { API_SCOPES } from '../../../../lib/api-contract';

const createSchema = z.object({
  name: z.string().trim().min(2).max(80),
  scopes: z.array(z.enum(API_SCOPES)).min(1).max(API_SCOPES.length).default(['members:read', 'members:write']),
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

  if(apiRevenueRequired(process.env.API_PAID_ACCESS_REQUIRED)&&!(await apiRevenueStatus(apiRevenueDatabase(),membership.organizationId,true)).entitled)return NextResponse.json({error:'A separate active API subscription is required before creating keys.',code:'API_SUBSCRIPTION_REQUIRED'},{status:402});
  const parsed = createSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: 'Choose a key name, at least one valid permission and an expiry of 1–365 days.' }, { status: 400 });
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
