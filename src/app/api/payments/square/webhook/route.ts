import { NextResponse } from 'next/server';
import {
  reconcileSquareWebhookOrder,
  verifySquareWebhookSignature,
} from '../../../../../lib/square-workflow-checkout';
import { squareCheckoutEnabled } from '../../../../../lib/square-connect';

/**
 * Square's notification body is verified before any database lookup.
 * A signed notification is only a trigger to re-verify the actual payment at Square.
 */
export async function POST(request: Request) {
  if (!squareCheckoutEnabled() || !process.env.SQUARE_WEBHOOK_SIGNATURE_KEY ||
      !process.env.SQUARE_WEBHOOK_NOTIFICATION_URL) {
    return NextResponse.json({ error: 'Square payment notification not configured.' }, { status: 503 });
  }
  const rawBody = await request.text();
  if (rawBody.length > 100000) return NextResponse.json({ error: 'Notification too large.' }, { status: 413 });
  const signature = request.headers.get('x-square-hmacsha256-signature') || '';
  if (!verifySquareWebhookSignature(rawBody, signature)) {
    return NextResponse.json({ error: 'Invalid Square signature.' }, { status: 401 });
  }
  try {
    const event = JSON.parse(rawBody) as {
      type?: string;
      merchant_id?: string;
      data?: { object?: { payment?: { order_id?: string } } };
    };
    if (event.type !== 'payment.updated' && event.type !== 'payment.created') {
      return NextResponse.json({ received: true });
    }
    const merchant = String(event.merchant_id || '');
    const orderId = String(event.data?.object?.payment?.order_id || '');
    if (!merchant || !orderId || orderId.length > 200) {
      return NextResponse.json({ received: true });
    }
    // Never grant paid access from webhook payload fields alone.
    const origin = (process.env.NEXT_PUBLIC_APP_URL || process.env.APP_BASE_URL ||
      'https://unified.icomputeranything.com').trim();
    await reconcileSquareWebhookOrder(orderId, merchant, origin);
    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('ICA_SQUARE_WEBHOOK_RECONCILIATION_ERROR', error instanceof Error ? error.message : 'Unknown webhook error');
    return NextResponse.json({ error: 'Square notification processing failed.' }, { status: 500 });
  }
}
