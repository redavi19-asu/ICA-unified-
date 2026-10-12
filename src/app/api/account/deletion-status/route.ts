import { NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';
import { consumeRateLimit } from '../../../../lib/security';
import { ensureAccountDeletionTables } from '../../../../lib/account-deletion';
import { deletionReceiptHash } from '../../../../lib/account-deletion-receipt';

export async function POST(request: Request) {
  const body = await request.json().catch(()=>null);
  if (typeof body?.receipt !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(body.receipt)) {
    return NextResponse.json({ error:'Status link is unavailable.' },{status:404});
  }
  const limit = await consumeRateLimit(request,{scope:'deletion-status',limit:30,windowSeconds:60});
  if (!limit.allowed) return NextResponse.json({error:'Please wait before checking again.'},{status:429});
  await ensureAccountDeletionTables();
  const rows = await prisma.$queryRawUnsafe<Array<{ scope:string;status:string;resolvedAt:string|null;
    message:string|null;expectedCompletionAt:string|null;trainingExpiresAt:number|null;archiveIdsJson:string|null }>>(`SELECT r.scope,r.status,r.resolvedAt,
    review.message,review.expectedCompletionAt,e.trainingExpiresAt,e.archiveIdsJson
    FROM AccountDeletionReceipt receipt JOIN AccountDeletionRequest r ON r.id=receipt.requestId
    LEFT JOIN AccountDeletionReview review ON review.requestId=r.id
    LEFT JOIN AccountDeletionExecution e ON e.requestId=r.id
    WHERE receipt.tokenHash=? AND (receipt.expiresAt IS NULL OR receipt.expiresAt>?)`,deletionReceiptHash(body.receipt),Date.now());
  const row=rows[0];
  if (!row) return NextResponse.json({error:'Status link is unavailable.'},{status:404});
  let archivedRecordsRemoved=false;
  if (row.status==='COMPLETED' && row.trainingExpiresAt && row.trainingExpiresAt<=Date.now()) {
    const count=await prisma.$queryRawUnsafe<Array<{n:number}>>('SELECT COUNT(*) AS n FROM AccountTrainingArchive WHERE id IN (SELECT value FROM json_each(?))',row.archiveIdsJson || '[]');
    archivedRecordsRemoved=count[0].n===0;
  }
  return NextResponse.json({scope:row.scope,status:row.status,resolvedAt:row.resolvedAt,message:row.message,
    expectedCompletionAt:row.expectedCompletionAt,trainingExpiresAt:row.trainingExpiresAt,archivedRecordsRemoved},
    {headers:{'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
}
