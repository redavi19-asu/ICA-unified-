import { NextResponse } from 'next/server';
import { readSocialRegistrationTicket } from '../../../../../lib/social-auth';

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const profile = await readSocialRegistrationTicket(String(body?.ticket || ''));

  if (!profile) {
    return NextResponse.json({ error: 'Social onboarding expired. Start again.' }, { status: 401 });
  }

  return NextResponse.json({
    provider: profile.provider,
    email: profile.email,
    displayName: profile.displayName,
    expiresAt: profile.expiresAt,
  });
}
