import { NextResponse } from 'next/server';
import { requireSession } from '../../../../lib/auth';
import { createDeveloperCheckout, createDeveloperPortal, developerBillingStatus, developerBillingReady } from '../../../../lib/developer-billing';

function errorResponse(error: unknown) {
  const code = error instanceof Error ? error.message : 'DEVELOPER_BILLING_UNAVAILABLE';
  const conflicts = ['DEVELOPER_SUBSCRIPTION_EXISTS', 'DEVELOPER_CHECKOUT_ALREADY_OPEN'];
  return NextResponse.json({
    error: code === 'DEVELOPER_BILLING_NOT_ACTIVE'
      ? 'Developer checkout is not activated yet.'
      : conflicts.includes(code)
        ? 'An existing developer subscription or unfinished checkout must be managed first.'
        : 'Developer billing is temporarily unavailable.',
  }, { status: code === 'DEVELOPER_BILLING_NOT_ACTIVE' ? 503 : conflicts.includes(code) ? 409 : 502 });
}

export async function GET() {
  const { membership } = await requireSession();
  if (!['OWNER', 'ADMIN'].includes(membership.role)) {
    return NextResponse.json({ error: 'Owner/admin access required.' }, { status: 403 });
  }
  try {
    return NextResponse.json(await developerBillingStatus(membership.organizationId), {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request) {
  const { membership } = await requireSession();
  if (!['OWNER', 'ADMIN'].includes(membership.role)) {
    return NextResponse.json({ error: 'Owner/admin access required.' }, { status: 403 });
  }
  if (!developerBillingReady()) {
    return NextResponse.json({ error: 'Developer checkout is not activated yet.' }, { status: 503 });
  }
  let action: string;
  let plan: unknown;
  try {
    const raw = await request.text();
    if (raw.length > 4096) return NextResponse.json({ error: 'Request too large.' }, { status: 413 });
    const body = JSON.parse(raw) as Record<string, unknown>;
    action = typeof body.action === 'string' ? body.action : '';
    plan = body.plan;
  } catch { return NextResponse.json({ error: 'Invalid request.' }, { status: 400 }); }

  try {
    const result = action === 'portal'
      ? await createDeveloperPortal(membership.organizationId)
      : action === 'checkout' && (plan === 'starter' || plan === 'pro')
        ? await createDeveloperCheckout(membership.organizationId, membership.user.email, plan)
        : null;
    if (!result) return NextResponse.json({ error: 'Choose a valid developer billing action and plan.' }, { status: 400 });
    return NextResponse.json({ url: result.url }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return errorResponse(error); }
}
