import { NextResponse } from 'next/server';
import { paypalAccessToken, paypalApiRoot, paypalPartnerConfig } from '../../../../../lib/paypal-connect';
import { paypalCheckoutEnabled, reconcilePayPalWebhookOrder } from '../../../../../lib/paypal-workflow-checkout';
import { reconcileBusinessRefundFromProviderEvent } from '../../../../../lib/business-refunds';

export async function POST(request: Request) {
  const cfg = paypalPartnerConfig();
  const webhookId = String(process.env.PAYPAL_WEBHOOK_ID || '').trim();
  if (!paypalCheckoutEnabled() || !webhookId) {
    return NextResponse.json({ error: 'PayPal business webhook is not configured.' }, { status: 503 });
  }
  const raw = await request.text();
  if (raw.length > 100000) return NextResponse.json({ error: 'Notification too large.' }, { status: 413 });
  let event: {
    event_type?: string;
    resource?: {
      id?: string;
      supplementary_data?: { related_ids?: { order_id?: string } };
    };
  };
  try { event = JSON.parse(raw); } catch {
    return NextResponse.json({ error: 'Invalid notification.' }, { status: 400 });
  }
  const authAlgo = request.headers.get('paypal-auth-algo') || '';
  const certUrl = request.headers.get('paypal-cert-url') || '';
  const transmissionId = request.headers.get('paypal-transmission-id') || '';
  const transmissionTime = request.headers.get('paypal-transmission-time') || '';
  const transmissionSignature = request.headers.get('paypal-transmission-sig') || '';
  if (!authAlgo || !certUrl || !transmissionId || !transmissionTime || !transmissionSignature) {
    return NextResponse.json({ error: 'Missing PayPal signature.' }, { status: 401 });
  }
  try {
    const accessToken = await paypalAccessToken();
    const verification = await fetch(paypalApiRoot(cfg.environment) + '/v1/notifications/verify-webhook-signature', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + accessToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        auth_algo: authAlgo,
        cert_url: certUrl,
        transmission_id: transmissionId,
        transmission_time: transmissionTime,
        transmission_sig: transmissionSignature,
        webhook_id: webhookId,
        webhook_event: event,
      }),
      cache: 'no-store',
    });
    if (!verification.ok) {
      return NextResponse.json({ error: 'PayPal signature could not be verified.' }, { status: 503 });
    }
    const result = await verification.json() as { verification_status?: string };
    if (result.verification_status !== 'SUCCESS') {
      return NextResponse.json({ error: 'Invalid PayPal signature.' }, { status: 401 });
    }
    if (event.event_type === 'PAYMENT.CAPTURE.REFUNDED') {
      const refundId = String(event.resource?.id || '');
      if (refundId) await reconcileBusinessRefundFromProviderEvent({ provider: 'PAYPAL', refundId });
      return NextResponse.json({ received: true });
    }
    if (event.event_type !== 'PAYMENT.CAPTURE.COMPLETED') {
      return NextResponse.json({ received: true });
    }
    const orderId = event.resource?.supplementary_data?.related_ids?.order_id || '';
    if (!/^[A-Za-z0-9_-]{8,130}$/.test(orderId)) {
      return NextResponse.json({ received: true });
    }
    const appOrigin = String(process.env.NEXT_PUBLIC_APP_URL || process.env.APP_BASE_URL ||
      'https://unified.icomputeranything.com').trim();
    // Signed notifications only trigger verification; paid status is read from PayPal's Order API.
    await reconcilePayPalWebhookOrder(orderId, appOrigin);
    return NextResponse.json({ received: true });
  } catch {
    console.error('ICA_PAYPAL_WEBHOOK_RECONCILIATION_FAILURE');
    return NextResponse.json({ error: 'PayPal notification reconciliation failed.' }, { status: 500 });
  }
}
