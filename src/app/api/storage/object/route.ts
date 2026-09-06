import { NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { requireSession } from '../../../../lib/auth';

export async function GET(request: Request) {
  const { membership } = await requireSession();
  const { searchParams } = new URL(request.url);
  const key = searchParams.get('key') || '';
  const requiredPrefix = `organizations/${membership.organizationId}/`;

  if (!key || !key.startsWith(requiredPrefix)) {
    return NextResponse.json({ error: 'File not found.' }, { status: 404 });
  }

  const { env } = getCloudflareContext();
  const bucket = (env as any).ICA_UNIFIED_STORAGE;
  if (!bucket) {
    return NextResponse.json({ error: 'Course storage is not configured.' }, { status: 503 });
  }

  const object = await bucket.get(key);
  if (!object) {
    return NextResponse.json({ error: 'File not found.' }, { status: 404 });
  }

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('etag', object.httpEtag);
  headers.set('cache-control', 'private, max-age=300');
  headers.set('x-content-type-options', 'nosniff');

  return new Response(object.body, { headers });
}
