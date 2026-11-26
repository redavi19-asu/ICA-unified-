import { NextResponse } from 'next/server';
import { handleWorkflowPaymentWebhook } from '../../../../lib/member-payments';
import { verifyStripeWebhookSignature } from '../../../../lib/stripe-billing';

export async function POST(request: Request) {
  const secret = process.env.STRIPE_CONNECT_WEBHOOK_SECRET?.trim();
  const apiKey = process.env.STRIPE_SECRET_KEY?.trim() || '';
  const mode = /^(?:sk|rk)_(live|test)_/.exec(apiKey)?.[1];

  if (!secret || !mode) {
    return NextResponse.json({ error: 'Connect webhook is not configured.' }, { status: 503 });
  }

  const signature = request.headers.get('stripe-signature') || '';
  const rawBody = await request.text();
  if (!verifyStripeWebhookSignature(rawBody, signature, secret)) {
    return NextResponse.json({ error: 'Invalid Stripe signature.' }, { status: 400 });
  }

  try {
    const event = JSON.parse(rawBody) as {
      type?: string;
      account?: string;
      livemode?: boolean;
      data?: { object?: unknown };
    };

    if (!event.account || event.livemode !== (mode === 'live')) {
      return NextResponse.json({ received: true });
    }

    await handleWorkflowPaymentWebhook(event);
    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('ICA_STRIPE_CONNECT_WEBHOOK_ERROR', error);
    return NextResponse.json({ error: 'Connect webhook processing failed.' }, { status: 500 });
  }
}
