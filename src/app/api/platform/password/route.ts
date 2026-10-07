import { NextResponse } from 'next/server';

export async function POST() {
  return NextResponse.json(
    {
      error: 'ICA Master credentials are managed from the ICA Master account, not inside ICA Unified.',
    },
    { status: 410 }
  );
}
