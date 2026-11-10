import { NextResponse } from 'next/server';
import { requireSession } from '../../../../lib/auth';
import {
  businessRefundsEnabled, requestFullBusinessRefund, reconcileBusinessRefund,
} from '../../../../lib/business-refunds';

/**
 * Explicitly authorized full merchant refund. A browser cannot supply the
 * payment provider, payment ID, amount or destination account.
 */
export async function POST(request: Request) {
  const { membership } = await requireSession();
  if (!['OWNER', 'ADMIN'].includes(membership.role)) {
    return NextResponse.json({ error: 'Only business owners and admins may issue refunds.' }, { status: 403 });
  }
  const origin = new URL(request.url).origin;
  const headerOrigin = request.headers.get('origin');
  if (headerOrigin && headerOrigin !== origin) {
    return NextResponse.json({ error: 'Invalid refund request origin.' }, { status: 403 });
  }
  const form = await request.formData().catch(() => null);
  const workflowId = String(form?.get('workflowId') || '');
  const submissionId = String(form?.get('submissionId') || '');
  const action = String(form?.get('action') || '');
  if (!/^[A-Za-z0-9_-]{3,128}$/.test(workflowId) ||
      !/^[A-Za-z0-9_-]{3,128}$/.test(submissionId)) {
    return NextResponse.json({ error: 'Invalid transaction reference.' }, { status: 400 });
  }
  if (action !== 'RECHECK' && action !== 'FULL_REFUND') {
    return NextResponse.json({ error: 'Unsupported refund action.' }, { status: 400 });
  }
  if (action === 'FULL_REFUND' && form?.get('confirm') !== 'FULL_REFUND') {
    return NextResponse.json({ error: 'A full refund requires explicit confirmation.' }, { status: 400 });
  }
  if (action === 'FULL_REFUND' && !businessRefundsEnabled()) {
    return NextResponse.redirect(origin + '/workspace/payments/transactions?refund=disabled', 303);
  }
  try {
    const outcome = action === 'RECHECK'
      ? await reconcileBusinessRefund({
          organizationId: membership.organizationId, workflowId, submissionId,
        })
      : await requestFullBusinessRefund({
          organizationId: membership.organizationId, workflowId, submissionId,
        });
    const status = outcome.state === 'COMPLETED' ? 'complete'
      : outcome.state === 'PENDING' ? 'pending'
        : outcome.state === 'IN_FLIGHT' ? 'checking' : 'failed';
    return NextResponse.redirect(origin + '/workspace/payments/transactions?refund=' + status, 303);
  } catch (error) {
    // Never leak provider responses, merchant IDs or account credentials.
    console.warn('ICA_BUSINESS_REFUND_ACTION_FAILED',
      error instanceof Error ? error.message : 'Unspecified refund failure');
    return NextResponse.redirect(origin + '/workspace/payments/transactions?refund=review', 303);
  }
}
