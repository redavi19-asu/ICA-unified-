import { NextResponse } from 'next/server';
import { handleStripeSnapshotEvent, verifyStripeWebhookSignature } from '../../../../lib/stripe-billing';
import { handleWorkflowPaymentWebhook } from '../../../../lib/member-payments';
import { reconcileBusinessRefundFromProviderEvent } from '../../../../lib/business-refunds';

export async function POST(request: Request) {
  const signature = request.headers.get('stripe-signature') || '';
  const rawBody = await request.text();

  try {
    if (!verifyStripeWebhookSignature(rawBody, signature)) {
      return NextResponse.json({ error: 'Invalid Stripe signature.' }, { status: 400 });
    }

    const event = JSON.parse(rawBody) as {
      type?: string;
      account?: string;
      data?: { object?: unknown };
    };

    if (event.type === 'refund.updated' || event.type === 'refund.created') {
      const refund = event.data?.object as { id?: string } | undefined;
      if (refund?.id) {
        await reconcileBusinessRefundFromProviderEvent({
          provider: 'STRIPE', refundId: String(refund.id), merchantId: String(event.account || ''),
        });
      }
      return NextResponse.json({ received: true });
    }
    const workflowPaymentHandled = await handleWorkflowPaymentWebhook(event);
    if (!workflowPaymentHandled) {
      await handleStripeSnapshotEvent(event);
    }
    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('ICA_STRIPE_WEBHOOK_ERROR', error);
    return NextResponse.json({ error: 'Webhook processing failed.' }, { status: 400 });
  }
}
