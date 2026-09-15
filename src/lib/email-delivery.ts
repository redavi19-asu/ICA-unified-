type TransactionalEmailInput = {
  recipient: string;
  subject: string;
  bodyText: string;
  idempotencyKey: string;
};

export function emailDeliveryConfigured() {
  return (
    String(process.env.EMAIL_PROVIDER || '').trim().toLowerCase() === 'resend' &&
    Boolean(String(process.env.EMAIL_API_KEY || '').trim()) &&
    Boolean(String(process.env.EMAIL_FROM || '').trim())
  );
}

export async function sendTransactionalEmail(input: TransactionalEmailInput) {
  if (!emailDeliveryConfigured()) {
    return { sent: false as const, skipped: true as const, providerMessageId: null };
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${String(process.env.EMAIL_API_KEY).trim()}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': input.idempotencyKey,
    },
    body: JSON.stringify({
      from: String(process.env.EMAIL_FROM).trim(),
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
