import { createHash, randomBytes } from 'crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '../../../../lib/prisma';
import { organizationHasUnifiedAccess } from '../../../../lib/auth';
import {
  emitOrganizationEvent,
  queueEmail,
  renderInvitationEmail,
} from '../../../../lib/organization-ops';
import { authenticateApiRequest, ApiKeyAuthResult } from '../../../../lib/api-keys';

const createSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().email().toLowerCase(),
  jobTitle: z.string().trim().max(100).optional().default(''),
  role: z.enum(['ADMIN', 'MANAGER', 'MEMBER']).default('MEMBER'),
});

export async function GET(request: Request) {
  const authResult = await apiOrganization(request, 'members:read');
  if (!authResult.ok) return apiAuthFailure(authResult);
  const auth = authResult;
  if (!auth.entitled) return subscriptionRequired();

  const memberships = await prisma.membership.findMany({
    where: { organizationId: auth.organizationId },
    include: { user: { select: { name: true, email: true } } },
    orderBy: { joinedAt: 'desc' },
    take: 500,
  });

  return NextResponse.json({
    data: memberships.map((item) => ({
      id: item.id,
      name: item.user.name,
      email: item.user.email,
      jobTitle: item.jobTitle,
      role: item.role,
      status: item.status,
      joinedAt: item.joinedAt,
    })),
  });
}

export async function POST(request: Request) {
  const authResult = await apiOrganization(request, 'members:write');
  if (!authResult.ok) return apiAuthFailure(authResult);
  const auth = authResult;
  if (!auth.entitled) return subscriptionRequired();

  const parsed = createSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: 'Check name, email, job title, and role.' }, { status: 400 });
  }

  const organization = auth.organization;

  const existingUser = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  if (existingUser) {
    const existingMembership = await prisma.membership.findUnique({
      where: { userId_organizationId: { userId: existingUser.id, organizationId: auth.organizationId } },
    });
    if (existingMembership) {
      return NextResponse.json({
        error: 'This person already belongs to the organization.',
        membershipId: existingMembership.id,
      }, { status: 409 });
    }
  }

  await prisma.invitation.updateMany({
    where: { organizationId: auth.organizationId, email: parsed.data.email, status: 'PENDING' },
    data: { status: 'REVOKED' },
  });

  const token = randomBytes(32).toString('hex');
  const tokenHash = createHash('sha256').update(token).digest('hex');
  const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000);
  const invitation = await prisma.invitation.create({
    data: {
      organizationId: auth.organizationId,
      email: parsed.data.email,
      name: parsed.data.name,
      jobTitle: parsed.data.jobTitle || null,
      role: parsed.data.role,
      tokenHash,
      expiresAt,
    },
  });

  const origin = new URL(request.url).origin;
  const inviteUrl = `${origin}/invite/${token}`;
  const email = renderInvitationEmail({
    organizationName: organization.name,
    recipientName: parsed.data.name,
    inviteUrl,
    expiresLabel: 'expires in 72 hours',
  });
  await queueEmail({
    organizationId: auth.organizationId,
    recipient: parsed.data.email,
    templateKey: 'MEMBER_INVITATION',
    subject: email.subject,
    bodyText: email.bodyText,
    payload: { invitationId: invitation.id },
  });

  await emitOrganizationEvent(auth.organizationId, 'member.invited', {
    invitationId: invitation.id,
    name: parsed.data.name,
    email: parsed.data.email,
    role: parsed.data.role,
  });

  return NextResponse.json({
    data: {
      invitationId: invitation.id,
      status: 'PENDING',
      activationUrl: inviteUrl,
      expiresAt,
    },
  }, { status: 201 });
}

async function apiOrganization(request: Request, requiredScope: 'members:read' | 'members:write') {
  const keyAuth = await authenticateApiRequest(request, requiredScope);
  if (!keyAuth.ok) return keyAuth;

  const organization = await prisma.organization.findUnique({
    where: { id: keyAuth.organizationId },
    select: {
      id: true,
      name: true,
      slug: true,
      status: true,
      plan: true,
      trialEndsAt: true,
    },
  });

  if (!organization) {
    return { ok: false as const, status: 401 as const, error: 'This ICA API key is invalid.' };
  }

  return {
    ...keyAuth,
    organization,
    entitled: await organizationHasUnifiedAccess(organization),
  };
}

function apiAuthFailure(auth: ApiKeyAuthResult | { ok: false; status: 401; error: string }) {
  if (auth.ok) {
    return NextResponse.json({ error: 'Unexpected API authentication state.' }, { status: 500 });
  }

  const headers = 'retryAfterSeconds' in auth && auth.retryAfterSeconds
    ? { 'Retry-After': String(auth.retryAfterSeconds) }
    : undefined;

  return NextResponse.json({ error: auth.error }, { status: auth.status, headers });
}

function subscriptionRequired() {
  return NextResponse.json(
    { error: 'This organization does not currently have active ICA Unified access.', code: 'SUBSCRIPTION_REQUIRED' },
    { status: 402 },
  );
}
