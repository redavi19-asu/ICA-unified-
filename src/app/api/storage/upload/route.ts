import { NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { requireSession } from '../../../../lib/auth';
import { prisma } from '../../../../lib/prisma';

const MAX_FILE_SIZE = 50 * 1024 * 1024;
const BLOCKED_VIDEO_TYPES = new Set([
  'video/mp4',
  'video/webm',
  'video/ogg',
  'video/quicktime',
  'video/x-msvideo',
]);

function safeName(name: string) {
  return name
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 120) || 'file';
}

export async function POST(request: Request) {
  const { membership } = await requireSession();
  if (!['OWNER', 'ADMIN', 'MANAGER'].includes(membership.role)) {
    return NextResponse.json({ error: 'You do not have permission to upload course files.' }, { status: 403 });
  }

  const form = await request.formData();
  const file = form.get('file');
  const courseId = String(form.get('courseId') || '');

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Choose a file to upload.' }, { status: 400 });
  }
  if (!courseId) {
    return NextResponse.json({ error: 'Course ID is required.' }, { status: 400 });
  }
  if (file.size <= 0) {
    return NextResponse.json({ error: 'The selected file is empty.' }, { status: 400 });
  }
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: 'Course files are limited to 50 MB. Training video should use the video service instead.' }, { status: 413 });
  }
  if (BLOCKED_VIDEO_TYPES.has(file.type) || file.type.startsWith('video/')) {
    return NextResponse.json({ error: 'Video uploads are kept separate from R2 course files. Use the video upload option when Stream is enabled.' }, { status: 400 });
  }

  const course = await prisma.course.findFirst({
    where: { id: courseId, organizationId: membership.organizationId },
    select: { id: true },
  });
  if (!course) {
    return NextResponse.json({ error: 'Course not found.' }, { status: 404 });
  }

  const { env } = getCloudflareContext();
  const bucket = (env as any).ICA_UNIFIED_STORAGE;
  if (!bucket) {
    return NextResponse.json({ error: 'Course storage is not configured.' }, { status: 503 });
  }

  const filename = safeName(file.name);
  const key = `organizations/${membership.organizationId}/learning/${course.id}/${crypto.randomUUID()}-${filename}`;
  const bytes = await file.arrayBuffer();

  await bucket.put(key, bytes, {
    httpMetadata: {
      contentType: file.type || 'application/octet-stream',
      contentDisposition: `inline; filename="${filename.replace(/"/g, '')}"`,
    },
    customMetadata: {
      organizationId: membership.organizationId,
      courseId: course.id,
      originalName: file.name.slice(0, 250),
      uploadedBy: membership.userId,
    },
  });

  const url = `/api/storage/object?key=${encodeURIComponent(key)}`;
  return NextResponse.json({
    ok: true,
    key,
    url,
    name: file.name,
    size: file.size,
    contentType: file.type || 'application/octet-stream',
  });
}
