import { socialCallbackRedirect } from '../../../../../../lib/social-callback-response';
import { finishSocialCallback, sessionCookie, type SocialProvider } from '../../../../../../lib/social-auth';
import { platformSessionCookie } from '../../../../../../lib/platform-auth';

function validProvider(value: string): value is SocialProvider {
  return value === 'google' || value === 'apple' || value === 'microsoft';
}

async function handle(request: Request, context: { params: Promise<{ provider: string }> }) {
  const params = await context.params;
  const origin = new URL(request.url).origin;

  if (!validProvider(params.provider)) {
    return socialCallbackRedirect(origin + '/login?social_error=Unknown+social+provider');
  }

  try {
    const result = await finishSocialCallback(request, params.provider);

    if (result.kind === 'register') {
      return socialCallbackRedirect(origin + '/register?social_ticket=' + encodeURIComponent(result.ticket));
    }

    if (result.kind === 'platform') {
      const response = socialCallbackRedirect(origin + '/platform');
      response.cookies.set(platformSessionCookie.name, result.token, platformSessionCookie.options);
      response.cookies.delete(sessionCookie.name);
      return response;
    }

    const response = socialCallbackRedirect(origin + '/workspace');
    response.cookies.set(sessionCookie.name, result.token, sessionCookie.options);
    return response;
  } catch (error) {
    const message = encodeURIComponent(error instanceof Error ? error.message : 'Social sign-in failed.');
    return socialCallbackRedirect(origin + '/login?social_error=' + message);
  }
}

export const GET = handle;
export const POST = handle;
