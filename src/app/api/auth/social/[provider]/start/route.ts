import { NextResponse } from 'next/server';
import { beginSocialAuth, type SocialProvider } from '../../../../../../lib/social-auth';

function validProvider(value: string): value is SocialProvider {
  return value === 'google' || value === 'apple' || value === 'microsoft';
}

export async function GET(request: Request, context: { params: Promise<{ provider: string }> }) {
  const params = await context.params;
  if (!validProvider(params.provider)) {
    return NextResponse.json({ error: 'Unknown social provider.' }, { status: 404 });
  }

  try {
    return NextResponse.redirect(await beginSocialAuth(request, params.provider));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Social sign-in could not start.' },
      { status: 503 },
    );
  }
}
