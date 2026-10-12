import { NextResponse } from 'next/server';
import { z } from 'zod';
import { readPlatformSession } from '../../../../../lib/platform-auth';
import { ensureAccountDeletionTables, previewAccountDeletion } from '../../../../../lib/account-deletion';
import { prisma } from '../../../../../lib/prisma';
import { completeAccountDeletion, DeletionBlocked } from '../../../../../lib/account-deletion-completion';

async function authorized() {
  const session = await readPlatformSession();
  return session && ['MASTER', 'PLATFORM_ADMIN'].includes(session.role) ? session : null;
}
export async function GET(_request: Request, props: { params: Promise<{ id: string }> }) {
  if (!await authorized()) return NextResponse.json({ error: 'Platform administrator access required.' }, { status: 403 });
  const { id } = await props.params;
  const preview = await previewAccountDeletion(id);
  return preview ? NextResponse.json(preview, { headers: { 'Cache-Control': 'no-store' } })
    : NextResponse.json({ error: 'Request not found.' }, { status: 404 });
}
const reviewSchema = z.object({
  status: z.enum(['UNDER_REVIEW', 'NEEDS_INFORMATION']),
  message: z.string().trim().min(10).max(1000),
  expectedCompletionAt: z.string().datetime().nullable(),
});
export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const session = await authorized();
  if (!session) return NextResponse.json({ error: 'Platform administrator access required.' }, { status: 403 });
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) return NextResponse.json({ error: 'Same-origin review required.' }, { status: 403 });
  const body = await request.json().catch(() => null);
  if (body?.action === 'COMPLETE') {
    const { id } = await props.params;
    const completion = z.object({ confirmation: z.literal(id), identityVerified: z.literal(true), externalDataReviewed: z.literal(true) }).safeParse(body);
    if (!completion.success) return NextResponse.json({ error: 'Confirm the request ID, account identity and external-data review before completion.' }, { status: 400 });
    try { return NextResponse.json({ ok: true, ...await completeAccountDeletion({ requestId: id, reviewedBy: session.platformAdminId }) }); }
    catch (error) {
      if (error instanceof DeletionBlocked) return NextResponse.json({ error: error.message }, { status: 409 });
      // Do not expose provider responses, SQL or account secrets to callers.
      return NextResponse.json({ error: 'Deletion did not complete. The account request remains available for review.' }, { status: 503 });
    }
  }
  const parsed = reviewSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Choose a review status and write a customer-facing update.' }, { status: 400 });
  if (parsed.data.expectedCompletionAt && Date.parse(parsed.data.expectedCompletionAt) <= Date.now()) {
    return NextResponse.json({ error: 'Expected completion must be a future date.' }, { status: 400 });
  }
  await ensureAccountDeletionTables();
  const { id } = await props.params;
  // A single conditional statement saves the review atomically. A resolved
  // request cannot be reopened or receive a late stale review update.
  const changed = await prisma.$executeRawUnsafe(`INSERT INTO AccountDeletionReview
    (requestId,reviewedBy,status,message,expectedCompletionAt,updatedAt)
    SELECT id,?,?,?,?,CURRENT_TIMESTAMP FROM AccountDeletionRequest
    WHERE id = ? AND status IN ('PENDING','UNDER_REVIEW','NEEDS_INFORMATION')
    ON CONFLICT(requestId) DO UPDATE SET reviewedBy=excluded.reviewedBy,status=excluded.status,
      message=excluded.message,expectedCompletionAt=excluded.expectedCompletionAt,updatedAt=CURRENT_TIMESTAMP`,
    session.platformAdminId, parsed.data.status, parsed.data.message, parsed.data.expectedCompletionAt, id);
  if (!changed) return NextResponse.json({ error: 'Request is missing or already resolved.' }, { status: 409 });
  return NextResponse.json({ ok: true });
}
