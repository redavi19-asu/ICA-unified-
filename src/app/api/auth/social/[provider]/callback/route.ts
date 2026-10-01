import { NextResponse } from 'next/server';
import { finishSocialCallback, sessionCookie, type SocialProvider } from '../../../../../../lib/social-auth';

function validProvider(value: string): value is SocialProvider {
  return value === 'google' || value === 'apple' || value === 'microsoft';
}

async function handle(request: Request, context: { params: Promise<{ provider: string }> }) {
  const params = await context.params;
  const origin = new URL(request.url).origin;

  if (!validProvider(params.provider)) {
    return NextResponse.redirect(origin + '/login?social_error=Unknown+social+provider');
  }

  try {
    const result = await finishSocialCallback(request, params.provider);

    if (result.kind === 'register') {
      return NextResponse.redirect(origin + '/register?social_ticket=' + encodeURIComponent(result.ticket));
    }

    const response = NextResponse.redirect(origin + '/workspace');
    response.cookies.set(sessionCookie.name, result.token, sessionCookie.options);
    return response;
  } catch (error) {
    const message = encodeURIComponent(error instanceof Error ? error.message : 'Social sign-in failed.');
    return NextResponse.redirect(origin + '/login?social_error=' + message);
  }
}

export const GET = handle;
export const POST = handle;
