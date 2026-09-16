import { NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { requireSession } from '../../../../../../lib/auth';
import { prisma } from '../../../../../../lib/prisma';
import { attachDocumentFile } from '../../../../../../lib/document-content';

type StorageBucket = {
  put: (key: string, value: ArrayBuffer, options?: unknown) => Promise<unknown>;
};

const MAX_FILE_SIZE = 20 * 1024 * 1024;

function safeName(name: string) {
  return name
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 120) || 'document';
}

export async function POST(
  request: Request,
  context: { params: Promise<{ documentId: string }> },
) {
  const { membership } = await requireSession();
  if (!['OWNER', 'ADMIN', 'MANAGER'].includes(membership.role)) {
    return NextResponse.json({ error: 'You do not have permission to upload controlled documents.' }, { status: 403 });
  }

  const { documentId } = await context.params;
  const document = await prisma.document.findFirst({
    where: { id: documentId, organizationId: membership.organizationId },
    select: { id: true },
  });
  if (!document) return NextResponse.json({ error: 'Document not found.' }, { status: 404 });

  const form = await request.formData();
  const file = form.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Choose a file to upload.' }, { status: 400 });
  }
  if (file.size <= 0) {
    return NextResponse.json({ error: 'The selected file is empty.' }, { status: 400 });
  }
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: 'Controlled document files are limited to 20 MB.' }, { status: 413 });
  }
  if (file.type.startsWith('video/')) {
    return NextResponse.json({ error: 'Video files are not supported as controlled documents.' }, { status: 400 });
  }

  const { env } = getCloudflareContext();
  const bucket = (env as unknown as { ICA_UNIFIED_STORAGE?: StorageBucket }).ICA_UNIFIED_STORAGE;
  if (!bucket) {
    return NextResponse.json({ error: 'Controlled document storage is not configured.' }, { status: 503 });
  }

  const filename = safeName(file.name);
  const key = `organizations/${membership.organizationId}/documents/${documentId}/${crypto.randomUUID()}-${filename}`;
  await bucket.put(key, await file.arrayBuffer(), {
    httpMetadata: {
      contentType: file.type || 'application/octet-stream',
      contentDisposition: `inline; filename="${filename.replace(/"/g, '')}"`,
    },
    customMetadata: {
      organizationId: membership.organizationId,
      documentId,
      originalName: file.name.slice(0, 250),
      uploadedBy: membership.userId,
    },
  });

  await attachDocumentFile({
    organizationId: membership.organizationId,
    documentId,
    storageKey: key,
    fileName: file.name.slice(0, 250),
    contentType: file.type || 'application/octet-stream',
  });

  await prisma.activity.create({
    data: {
      organizationId: membership.organizationId,
      actorId: membership.userId,
      type: 'DOCUMENT_FILE_ATTACHED',
      message: `${membership.user.name} attached ${file.name} to a controlled document.`,
    },
  });

  return NextResponse.json({
    ok: true,
    fileName: file.name,
    fileUrl: `/api/documents/${documentId}/file`,
  });
}
