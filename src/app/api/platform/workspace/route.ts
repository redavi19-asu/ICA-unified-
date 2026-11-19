import { NextResponse } from 'next/server';
import { requirePlatformAdmin } from '../../../../lib/platform-auth';
import { createMasterWorkspaceSession } from '../../../../lib/master-workspace';
import { sessionCookie } from '../../../../lib/auth';

export async function POST(request: Request) {
  // A workspace session is a state change: require a same-origin form POST.
  const origin = new URL(request.url).origin;
  if (request.headers.get('origin') !== origin) {
    return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 });
  }
  const admin = await requirePlatformAdmin();
  try {
    const token = await createMasterWorkspaceSession(admin.email);
    if (!token) return NextResponse.redirect(new URL('/login?social_error=No+active+workspace+membership+is+linked+to+this+administrator+account.', origin), 303);
    const response = NextResponse.redirect(new URL('/workspace', origin), 303);
    response.cookies.set(sessionCookie.name, token, sessionCookie.options);
    return response;
  } catch {
    return NextResponse.redirect(new URL('/login?social_error=Enter+the+ICA+Company+ID+to+choose+your+workspace.', origin), 303);
  }
}
