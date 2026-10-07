type TurnstileResponse = {
  success: boolean;
  'error-codes'?: string[];
  hostname?: string;
  action?: string;
};

function hostnameFrom(value: string | undefined | null) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    return new URL(raw).hostname.toLowerCase();
  } catch {
    return raw.toLowerCase().replace(/^https?:\/\//, '').split('/')[0];
  }
}

export async function verifyTurnstile(
  token: string | undefined,
  request: Request,
  expectedAction = '',
) {
  const secret = String(process.env.TURNSTILE_SECRET_KEY || '').trim();

  if (!secret) {
    return {
      success: process.env.NODE_ENV !== 'production',
      configured: false,
      hostname: '',
      action: '',
      errors: ['missing-input-secret'],
    };
  }

  if (!token) {
    return {
      success: false,
      configured: true,
      hostname: '',
      action: '',
      errors: ['missing-input-response'],
    };
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
    return {
      success: false,
      configured: true,
      hostname: '',
      action: '',
      errors: [`siteverify-http-${response.status}`],
    };
  }

  const result = await response.json() as TurnstileResponse;
  const hostname = hostnameFrom(result.hostname);
  const action = String(result.action || '').trim();

  const originHost = hostnameFrom(request.headers.get('origin'));
  const requestHost = hostnameFrom(new URL(request.url).origin);
  const configuredHosts = [
    hostnameFrom(process.env.NEXT_PUBLIC_APP_URL),
    hostnameFrom(process.env.APP_BASE_URL),
    hostnameFrom(process.env.SOCIAL_AUTH_ORIGIN),
    'unified.icomputeranything.com',
  ].filter(Boolean);

  if (process.env.NODE_ENV !== 'production') {
    configuredHosts.push('localhost', '127.0.0.1');
  }

  const allowedHostnames = new Set([originHost, requestHost, ...configuredHosts].filter(Boolean));
  const hostnameValid = Boolean(hostname && allowedHostnames.has(hostname));
  const actionValid = Boolean(action && (!expectedAction || action === expectedAction));

  return {
    success: Boolean(result.success === true && hostnameValid && actionValid),
    configured: true,
    hostname,
    action,
    hostnameValid,
    actionValid,
    errors: result['error-codes'] || [],
  };
}
