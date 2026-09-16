import { NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { requireSession } from '../../../../../../lib/auth';
import { prisma } from '../../../../../../lib/prisma';
import { getDocumentContent } from '../../../../../../lib/document-content';

type StoredObject = {
  body: BodyInit | null;
  httpEtag: string;
  writeHttpMetadata: (headers: Headers) => void;
};

type StorageBucket = {
  get: (key: string) => Promise<StoredObject | null>;
};

export async function GET(
  _request: Request,
  context: { params: Promise<{ documentId: string }> },
) {
  const { membership } = await requireSession();
  const { documentId } = await context.params;

  const document = await prisma.document.findFirst({
    where: { id: documentId, organizationId: membership.organizationId },
    select: { id: true },
  });
  if (!document) return NextResponse.json({ error: 'Document not found.' }, { status: 404 });

  const content = await getDocumentContent(membership.organizationId, documentId);
  if (!content?.storageKey) {
    return NextResponse.json({ error: 'No file is attached to this document.' }, { status: 404 });
  }

  const { env } = getCloudflareContext();
  const bucket = (env as unknown as { ICA_UNIFIED_STORAGE?: StorageBucket }).ICA_UNIFIED_STORAGE;
  if (!bucket) {
    return NextResponse.json({ error: 'Controlled document storage is not configured.' }, { status: 503 });
  }

  const object = await bucket.get(content.storageKey);
  if (!object) return NextResponse.json({ error: 'Document file not found.' }, { status: 404 });

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('etag', object.httpEtag);
  headers.set('cache-control', 'private, max-age=120');
  headers.set('x-content-type-options', 'nosniff');
  headers.set('content-disposition', `inline; filename="${String(content.fileName || 'document').replace(/"/g, '')}"`);

  return new Response(object.body, { headers });
}
