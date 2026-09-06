import { NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { requireSession } from '../../../../lib/auth';
import { prisma } from '../../../../lib/prisma';

const MAX_BASIC_UPLOAD_BYTES = 200 * 1024 * 1024;
const DEFAULT_MAX_DURATION_SECONDS = 4 * 60 * 60;

export async function POST(request: Request) {
  const { membership } = await requireSession();
  if (!['OWNER', 'ADMIN', 'MANAGER'].includes(membership.role)) {
    return NextResponse.json({ error: 'You do not have permission to upload training videos.' }, { status: 403 });
  }

  let body: { courseId?: string; fileName?: string; fileSize?: number; maxDurationSeconds?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid video upload request.' }, { status: 400 });
  }

  const courseId = String(body.courseId || '');
  const fileName = String(body.fileName || 'training-video').slice(0, 180);
  const fileSize = Number(body.fileSize || 0);
  const requestedDuration = Number(body.maxDurationSeconds || DEFAULT_MAX_DURATION_SECONDS);

  if (!courseId) {
    return NextResponse.json({ error: 'Course ID is required.' }, { status: 400 });
  }
  if (!Number.isFinite(fileSize) || fileSize <= 0) {
    return NextResponse.json({ error: 'Choose a valid video file.' }, { status: 400 });
  }
  if (fileSize > MAX_BASIC_UPLOAD_BYTES) {
    return NextResponse.json({
      error: 'This Stream-ready uploader currently supports videos up to 200 MB. Larger videos will use resumable TUS uploads when the paid video plan is enabled.',
    }, { status: 413 });
  }

  const course = await prisma.course.findFirst({
    where: { id: courseId, organizationId: membership.organizationId },
    select: { id: true },
  });
  if (!course) {
    return NextResponse.json({ error: 'Course not found.' }, { status: 404 });
  }

  const { env } = getCloudflareContext();
  const stream = (env as any).STREAM;
  if (!stream?.createDirectUpload) {
    return NextResponse.json({
      error: 'Cloudflare Stream is wired into Unified, but video storage is not enabled on this account yet.',
      code: 'STREAM_NOT_ENABLED',
    }, { status: 503 });
  }

  try {
    const expiry = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    const maxDurationSeconds = Math.max(60, Math.min(36000, Math.round(requestedDuration)));
    const origin = new URL(request.url).hostname;

    const directUpload = await stream.createDirectUpload({
      maxDurationSeconds,
      expiry,
      creator: String(membership.userId).slice(0, 64),
      meta: {
        source: 'ica-unified-lms',
        organizationId: membership.organizationId,
        courseId: course.id,
        fileName,
        uploadedBy: membership.userId,
      },
      allowedOrigins: origin ? [origin] : [],
      requireSignedURLs: false,
    });

    return NextResponse.json({
      ok: true,
      uploadURL: directUpload.uploadURL,
      uid: directUpload.id,
      mediaUrl: `stream:${directUpload.id}`,
      expiresAt: expiry,
      maxBasicUploadBytes: MAX_BASIC_UPLOAD_BYTES,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Stream storage is not available yet.';
    return NextResponse.json({
      error: 'Cloudflare Stream is wired and ready, but hosted video storage is not enabled yet.',
      detail: message,
      code: 'STREAM_NOT_ENABLED',
    }, { status: 503 });
  }
}
