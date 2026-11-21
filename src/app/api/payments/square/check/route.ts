import { NextResponse } from 'next/server';
import { requireSession } from '../../../../../lib/auth';
import {
  getSquareMerchantStatus, listSquareMerchantLocations, squareConfig,
} from '../../../../../lib/square-connect';

/**
 * A self-service, read-only remote merchant health check.
 * Automatically refreshes OAuth tokens if near expiry; never charges a customer.
 */
export async function POST(request: Request) {
  const { membership } = await requireSession();
  if (!['OWNER', 'ADMIN'].includes(membership.role)) {
    return NextResponse.json({ error: 'Only the business owner or admin can check payments.' }, { status: 403 });
  }
  const origin = new URL(request.url).origin;
  const submittedOrigin = request.headers.get('origin');
  if (submittedOrigin && submittedOrigin !== origin) {
    return NextResponse.json({ error: 'Invalid connection check origin.' }, { status: 403 });
  }
  const config = squareConfig();
  const callbackOrigin = config.redirectUri ? new URL(config.redirectUri).origin : origin;
  if (!config.ready) {
    return NextResponse.redirect(callbackOrigin + '/workspace/payments?square=check-unavailable', 303);
  }
  try {
    const connection = await getSquareMerchantStatus(membership.organizationId);
    if (!connection || connection.mode !== config.mode) {
      return NextResponse.redirect(callbackOrigin + '/workspace/payments?square=check-reconnect', 303);
    }
    const locations = await listSquareMerchantLocations(membership.organizationId);
    const locationReady = locations.some((location) => location.id === connection.locationId);
    return NextResponse.redirect(
      callbackOrigin + '/workspace/payments?square=' + (locationReady ? 'check-ok' : 'check-location'),
      303,
    );
  } catch (error) {
    console.warn('ICA_SQUARE_SELF_SERVICE_CHECK_FAILED',
      error instanceof Error ? error.message : 'Square merchant could not be validated');
    return NextResponse.redirect(callbackOrigin + '/workspace/payments?square=check-reconnect', 303);
  }
}
