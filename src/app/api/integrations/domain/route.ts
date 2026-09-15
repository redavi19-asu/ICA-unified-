import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSession } from '../../../../lib/auth';
import { getCustomDomain, setCustomDomain, verifyCustomDomain } from '../../../../lib/organization-ops';

const domainSchema = z.object({
  hostname: z.string().trim().toLowerCase()
    .min(4).max(253)
    .regex(/^(?=.{1,253}$)(?!-)[a-z0-9-]+(?:\.[a-z0-9-]+)+$/, 'Enter a hostname such as members.example.org'),
});

export async function GET() {
  const { membership } = await requireSession();
  if (!['OWNER', 'ADMIN'].includes(membership.role)) {
    return NextResponse.json({ error: 'Owner or admin access is required.' }, { status: 403 });
  }

  const domain = await getCustomDomain(membership.organizationId);
  return NextResponse.json({
    domain,
    dnsRecord: domain ? {
      type: 'TXT',
      name: `_ica-unified.${domain.hostname}`,
      value: `ica-domain-verification=${domain.verificationToken}`,
    } : null,
    routingReady: false,
    routingNote: 'DNS ownership verification works now. Final custom-host routing is activated when Cloudflare custom-host credentials are connected.',
  });
}

export async function POST(request: Request) {
  const { membership } = await requireSession();
  if (!['OWNER', 'ADMIN'].includes(membership.role)) {
    return NextResponse.json({ error: 'Owner or admin access is required.' }, { status: 403 });
  }

  const body = await request.json();
  if (body?.action === 'VERIFY') {
    const result = await verifyCustomDomain(membership.organizationId);
    return NextResponse.json(result, { status: result.verified ? 200 : 409 });
  }

  const parsed = domainSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Check the domain.' }, { status: 400 });
  }

  const domain = await setCustomDomain(membership.organizationId, parsed.data.hostname);
  return NextResponse.json({
    domain,
    dnsRecord: {
      type: 'TXT',
      name: `_ica-unified.${domain.hostname}`,
      value: `ica-domain-verification=${domain.verificationToken}`,
    },
  }, { status: 201 });
}
