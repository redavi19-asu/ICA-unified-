import { NextResponse } from 'next/server';
import { completeSocialRegistration, sessionCookie } from '../../../../../lib/social-auth';

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));

  try {
    const result = await completeSocialRegistration(
      String(body?.ticket || ''),
      String(body?.organizationName || ''),
    );

    const response = NextResponse.json({
      ok: true,
      verificationRequired: false,
      organization: result.organization,
    });
    response.cookies.set(sessionCookie.name, result.token, sessionCookie.options);
    return response;
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Social onboarding could not be completed.' },
      { status: 400 },
    );
  }
}
