type TransactionalEmailInput = {
  recipient: string;
  subject: string;
  bodyText: string;
  idempotencyKey: string;
};

const DEFAULT_EMAIL_PROVIDER = 'resend';
const DEFAULT_EMAIL_FROM = 'ICA Unified <no-reply@unified.icomputeranything.com>';

export function emailProvider() {
  return String(process.env.EMAIL_PROVIDER || DEFAULT_EMAIL_PROVIDER).trim().toLowerCase();
}

export function emailApiKey() {
  return String(process.env.EMAIL_API_KEY || process.env.RESEND_API_KEY || '').trim();
}

export function emailFromAddress() {
  return String(process.env.EMAIL_FROM || DEFAULT_EMAIL_FROM).trim();
}

export function emailDeliveryConfigured() {
  return (
    emailProvider() === 'resend' &&
    Boolean(emailApiKey()) &&
    Boolean(emailFromAddress())
  );
}

export async function sendTransactionalEmail(input: TransactionalEmailInput) {
  if (!emailDeliveryConfigured()) {
    return { sent: false as const, skipped: true as const, providerMessageId: null };
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${emailApiKey()}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': input.idempotencyKey,
    },
    body: JSON.stringify({
      from: emailFromAddress(),
      to: [input.recipient],
      subject: input.subject,
      text: input.bodyText,
    }),
  });

  const data = await response.json().catch(() => ({})) as { id?: string; message?: string; error?: { message?: string } };
  if (!response.ok) {
    throw new Error(data.error?.message || data.message || `Email provider returned HTTP ${response.status}.`);
  }

  return {
    sent: true as const,
    skipped: false as const,
    providerMessageId: data.id || null,
  };
}
