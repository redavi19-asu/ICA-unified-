import { NextResponse } from 'next/server';
import { handleStripeSnapshotEvent, verifyStripeWebhookSignature } from '../../../../lib/stripe-billing';

export async function POST(request: Request) {
  const signature = request.headers.get('stripe-signature') || '';
  const rawBody = await request.text();

  try {
    if (!verifyStripeWebhookSignature(rawBody, signature)) {
      return NextResponse.json({ error: 'Invalid Stripe signature.' }, { status: 400 });
    }

    const event = JSON.parse(rawBody) as {
      type?: string;
      data?: { object?: unknown };
    };

    await handleStripeSnapshotEvent(event);
    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('ICA_STRIPE_WEBHOOK_ERROR', error);
    return NextResponse.json({ error: 'Webhook processing failed.' }, { status: 400 });
  }
}
