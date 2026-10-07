import { NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';
import { findActiveIcaMasterOwner } from '../../../../lib/ica-master-auth';

export async function GET() {
  try {
    const master = await findActiveIcaMasterOwner();
    if (!master) {
      return NextResponse.json(
        { ok: false, service: 'ICA Unified Master identity' },
        { status: 503, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    const localUser = await prisma.user.findUnique({
      where: { email: master.email.toLowerCase() },
      include: {
        memberships: {
          include: {
            organization: {
              include: { _count: { select: { memberships: true } } },
            },
          },
        },
      },
    });

    const residue = (localUser?.memberships || []).some((membership) => (
      membership.role === 'OWNER' &&
      membership.organization.slug !== 'ica-master' &&
      membership.organization.status === 'TRIAL' &&
      membership.organization.plan === 'trial' &&
      membership.organization._count.memberships === 1
    ));

    return NextResponse.json(
      { ok: !residue, service: 'ICA Unified Master identity' },
      { status: residue ? 409 : 200, headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    console.error('ICA_UNIFIED_MASTER_IDENTITY_DIAGNOSTIC_ERROR', error);
    return NextResponse.json(
      { ok: false, service: 'ICA Unified Master identity' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
