import { NextResponse } from 'next/server';

// OAuth form_post completes at a GET page; never forward the authorization body.
export function socialCallbackRedirect(destination: string) {
  return NextResponse.redirect(destination, 303);
}
