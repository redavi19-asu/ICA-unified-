import { NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { requireSession } from '../../../../lib/auth';
import { prisma } from '../../../../lib/prisma';

export async function GET(request: Request) {
  const { membership } = await requireSession();
  const url = new URL(request.url);
  const lessonId = url.searchParams.get('lessonId') || '';

  if (!lessonId) {
    return NextResponse.json({ error: 'Lesson ID is required.' }, { status: 400 });
  }

  const lesson = await prisma.lesson.findFirst({
    where: { id: lessonId, organizationId: membership.organizationId },
    select: { id: true, mediaUrl: true, kind: true },
  });

  if (!lesson || lesson.kind !== 'VIDEO' || !lesson.mediaUrl?.startsWith('stream:')) {
    return NextResponse.json({ error: 'Stream video not found for this lesson.' }, { status: 404 });
  }

  const uid = lesson.mediaUrl.slice('stream:'.length);
  if (!uid) {
    return NextResponse.json({ error: 'Stream video ID is missing.' }, { status: 404 });
  }

  const { env } = getCloudflareContext();
  const stream = (env as any).STREAM;
  if (!stream?.video) {
    return NextResponse.json({
      error: 'Cloudflare Stream is wired into Unified, but hosted video storage is not enabled yet.',
      code: 'STREAM_NOT_ENABLED',
    }, { status: 503 });
  }

  try {
    const details = await stream.video(uid).details();
    const preview = typeof details.preview === 'string' ? details.preview : '';
    const playerUrl = preview ? preview.replace(/\/watch(?:\?.*)?$/, '/iframe') : null;

    return NextResponse.json({
      ok: true,
      uid,
      readyToStream: Boolean(details.readyToStream),
      state: details.status?.state || 'processing',
      playerUrl,
      thumbnail: details.thumbnail || null,
      duration: typeof details.duration === 'number' ? details.duration : null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to read Stream video status.';
    return NextResponse.json({
      error: 'Cloudflare Stream video is not available yet.',
      detail: message,
      code: 'STREAM_NOT_ENABLED',
    }, { status: 503 });
  }
}
