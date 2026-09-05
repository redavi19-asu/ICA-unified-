type TurnstileResponse = {
  success: boolean;
  'error-codes'?: string[];
  hostname?: string;
};

export async function verifyTurnstile(token: string | undefined, request: Request) {
  const secret = process.env.TURNSTILE_SECRET_KEY;

  // Keep deployments usable until the Turnstile secret is configured.
  if (!secret) {
    return { success: true, configured: false };
  }

  if (!token) {
    return { success: false, configured: true };
  }

  const ip = request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();

  const form = new FormData();
  form.append('secret', secret);
  form.append('response', token);
  if (ip) form.append('remoteip', ip);

  const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    body: form,
  });

  if (!response.ok) {
    return { success: false, configured: true };
  }

  const result = await response.json() as TurnstileResponse;
  return { success: result.success === true, configured: true };
}
