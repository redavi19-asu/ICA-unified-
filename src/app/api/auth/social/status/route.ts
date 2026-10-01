import { NextResponse } from 'next/server';
import { socialProviderStatus } from '../../../../../lib/social-auth';

export async function GET() {
  return NextResponse.json({ providers: socialProviderStatus() });
}
