import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireSession } from '../../../lib/auth';
import {
  getOrganizationPaymentAccount,
  refreshOrganizationPaymentAccount,
  stripeConnectConfigured,
} from '../../../lib/member-payments';
import { BUSINESS_PAYMENT_PROVIDERS, providerCanAcceptUnifiedPayments } from '../../../lib/business-payment-providers';
import { getSquareMerchantStatus, listSquareMerchantLocations, squareOauthConfigured, squareConfig, squareCheckoutEnabled } from '../../../lib/square-connect';
import { paymentHubReadiness } from '../../../lib/payment-hub-readiness';
import { preferredBusinessCheckoutProvider, businessCheckoutReady } from '../../../lib/business-payment-preferences';
import styles from './payments.module.css';

export default async function PaymentHubPage({
  searchParams,
}: {
  searchParams: Promise<{ connect?: string; square?: string; selected?: string }>;
}) {
  const { membership } = await requireSession();
  if (!['OWNER', 'ADMIN'].includes(membership.role)) redirect('/workspace');

  const params = await searchParams;
  let connection = await getOrganizationPaymentAccount(membership.organizationId);
  let refreshFailed = false;

  if ((params.connect === 'return' || params.connect === 'refresh') && stripeConnectConfigured()) {
    try {
      connection = await refreshOrganizationPaymentAccount(membership.organizationId);
    } catch (error) {
      refreshFailed = true;
      console.error('ICA_PAYMENT_HUB_STRIPE_REFRESH_ERROR', error);
    }
  }

  const squareConfigured = squareOauthConfigured();
  const squareConnection = await getSquareMerchantStatus(membership.organizationId);
  const squareMode = squareConfig().mode;
  let squareLocations: Array<{ id: string; name: string }> = [];
  if (squareConfigured && squareConnection?.status === 'NEEDS_LOCATION' && squareConnection.mode === squareMode) {
    try {
      squareLocations = await listSquareMerchantLocations(membership.organizationId);
    } catch (error) {
      console.error('ICA_PAYMENT_HUB_SQUARE_LOCATIONS_ERROR', error instanceof Error ? error.message : 'Unable to retrieve locations');
    }
  }

  const preferredProvider = await preferredBusinessCheckoutProvider(membership.organizationId);
  const squareCollectionReady = await businessCheckoutReady(membership.organizationId, 'SQUARE');

  const stripeConfigured = stripeConnectConfigured();
  const stripeReady = stripeConfigured &&
    Boolean(connection?.connectedAccountId && Number(connection.chargesEnabled) && Number(connection.payoutsEnabled));

  const squareIsSelected = preferredProvider === 'SQUARE';
  const selectedReadiness = paymentHubReadiness(squareIsSelected ? {
    selected: 'SQUARE',
    platformReady: squareConfigured,
    accountConnected: Boolean(squareConnection && squareConnection.mode === squareMode),
    merchantReady: squareConnection?.status === 'CONNECTED' && squareConnection.mode === squareMode,
    locationReady: Boolean(squareConnection?.locationId),
    checkoutEnabled: squareCheckoutEnabled(),
    recurringEnabled: false,
    productionMode: squareMode === 'production',
  } : {
    selected: 'STRIPE',
    platformReady: stripeConfigured,
    accountConnected: Boolean(connection?.connectedAccountId),
    merchantReady: stripeReady,
    locationReady: true,
    checkoutEnabled: stripeConfigured,
    recurringEnabled: true,
  });

  return (
    <main className={styles.shell}>
      <Link className={styles.back} href="/workspace">← Workspace</Link>
      <header className={styles.header}>
        <span className={styles.eyebrow}>ICA UNIFIED / BUSINESS PAYMENTS</span>
        <h1>Payment Hub</h1>
        <p>Choose how <strong>{membership.organization.name}</strong> collects its own money. No technical setup required inside Unified beyond connecting a supported account.</p>
      </header>

      <div className={styles.notice}>
        <strong>Two separate money flows</strong>
        <p>Customer payments for your business go to your connected payment provider. Your ICA Unified software subscription is managed separately in <Link href="/workspace/billing">Unified Billing</Link>.</p>
      </div>

      {(params.connect === 'error' || params.connect === 'unavailable' || refreshFailed) && (
        <p className={styles.error} role="alert">
          {params.connect === 'unavailable'
            ? 'Stripe Connect is not configured for Unified yet. Business payments are not available.'
            : 'We could not finish checking the Stripe connection. Try again or contact ICA support.'}
        </p>
      )}

      {(params.square === 'error' || params.square === 'cancelled' || params.square === 'needs-location' || params.square === 'connected' || params.square === 'location-selected' || params.square === 'location-error' || params.square === 'check-ok' || params.square === 'check-reconnect' || params.square === 'check-location' || params.square === 'check-unavailable') && (
        <p className={params.square === 'error' || params.square === 'location-error' || params.square === 'check-reconnect' ? styles.error : styles.notice} role="status">
          {params.square === 'check-ok'
            ? 'Square successfully verified your merchant account and payment location. Your saved connection is healthy.'
            : params.square === 'check-location'
              ? 'Square is connected, but the selected location cannot accept payments. Choose an eligible location below.'
              : params.square === 'check-reconnect'
                ? 'Square needs attention. Choose Reconnect Square account below to restore access.'
                : params.square === 'check-unavailable'
                  ? 'Square is not configured on Unified yet. No action is needed on your business account.'
                  : params.square === 'connected' || params.square === 'location-selected'
            ? 'Square business account authorized. Customer payments remain unavailable until Square checkout and verification finish testing.'
            : params.square === 'needs-location'
              ? 'Square authorized your account, but no eligible USD card-processing location was found. Check your Square account.'
              : params.square === 'cancelled'
                ? 'Square connection was cancelled. No changes were made to your business payments.'
                : params.square === 'location-error'
                  ? 'We could not verify that Square location. Please select an eligible location.'
                : 'Square authorization could not be completed. Try again or contact ICA support.'}
        </p>
      )}


      <section className={styles.notice} aria-label="Selected business payment processor">
        <strong>Customer checkout processor: {preferredProvider === 'STRIPE' ? 'Stripe' : 'Square'}</strong>
        <p>This setting determines how your business collects membership dues and event fees. It does not change your ICA Unified subscription.</p>
        {params.selected === '1' && <p role="status">Business checkout provider updated.</p>}
        {params.selected === 'unavailable' && <p className={styles.error} role="alert">That processor cannot be selected until its merchant account and checkout are ready.</p>}
      </section>


      <section className={styles.readinessPanel} aria-labelledby="payment-readiness-title">
        <div className={styles.readinessHeader}>
          <div>
            <span className={styles.eyebrow}>AUTOMATIC PAYMENT SETUP CHECK</span>
            <h2 id="payment-readiness-title">{selectedReadiness.headline}</h2>
            <p>These checks show what&apos;s ready and what you can fix yourself. They don&apos;t create charges or access your customers&apos; card details.</p>
          </div>
          <span className={selectedReadiness.readyForOneTime ? styles.ready : styles.pending}>
            {selectedReadiness.readyForOneTime ? 'Configuration ready' : 'Setup needs attention'}
          </span>
        </div>
        <ol className={styles.readinessList}>
          {selectedReadiness.steps.map((step) => (
            <li key={step.id}>
              <span aria-hidden="true" className={step.state === 'complete' ? styles.doneIcon : styles.waitIcon}>
                {step.state === 'complete' ? '✓' : '•'}
              </span>
              <div>
                <strong>{step.label}</strong>
                <p>{step.guidance}</p>
              </div>
            </li>
          ))}
        </ol>
        {!selectedReadiness.readyForOneTime && (
          <p className={styles.readinessHelp}>
            Use the connection controls below to complete setup. If a connection stops working, reconnect it here—no API keys or webhook configuration required.
          </p>
        )}
      </section>

      <section aria-labelledby="providers-title">
        <h2 id="providers-title">Your payment providers</h2>
        <p className={styles.subheading}>Only a connected, verified processor can accept payments. More providers will appear here as their integrations are completed.</p>
        <div className={styles.grid}>
          {BUSINESS_PAYMENT_PROVIDERS.map((provider) => {
            const stripe = provider.id === 'STRIPE';
            const active = stripe && providerCanAcceptUnifiedPayments(provider.id, stripeReady);
            return (
              <article className={styles.card} key={provider.id}>
                <div className={styles.cardHeader}>
                  <h3>{provider.name}</h3>
                  <span className={active ? styles.ready : styles.pending}>
                    {active ? 'Ready to collect' : provider.id === 'SQUARE' ? squareConnection?.status === 'CONNECTED' && squareConnection.mode === squareMode ? 'Authorized · checkout pending' : 'Connection beta' : provider.integrationStatus === 'PLANNED' ? 'Not available yet' : 'Not connected'}
                  </span>
                </div>
                <p>{provider.summary}</p>

                {stripe ? (
                  <div className={styles.actions}>
                    <p className={styles.connection}>
                      Connection: <strong>{connection?.onboardingStatus?.replaceAll('_', ' ') || 'NOT CONNECTED'}</strong>
                    </p>
                    {stripeConfigured ? (
                      <>
                        {!active && (
                          <form action="/api/billing/connect" method="post">
                            <input type="hidden" name="action" value="ONBOARD" />
                            <button type="submit">{connection?.connectedAccountId ? 'Continue secure setup' : 'Connect Stripe account'}</button>
                          </form>
                        )}
                        {connection?.connectedAccountId && (
                          <form action="/api/billing/connect" method="post">
                            <input type="hidden" name="action" value="REFRESH" />
                            <button className={styles.secondaryButton} type="submit">Check connection status</button>
                          </form>
                        )}
                        {stripeReady && preferredProvider !== 'STRIPE' && (
                          <form action="/api/payments/provider" method="post">
                            <input type="hidden" name="provider" value="STRIPE" />
                            <button type="submit">Use Stripe for customer checkouts</button>
                          </form>
                        )}
                        {stripeReady && preferredProvider === 'STRIPE' && <p className={styles.connection}>Selected for customer checkouts</p>}
                      </>
                    ) : (
                      <p className={styles.unavailable}>Stripe setup is temporarily unavailable. Contact ICA support.</p>
                    )}
                  </div>
                ) : provider.id === 'SQUARE' ? (
                  <div className={styles.actions}>
                    {squareConnection && (
                      <p className={styles.connection}>
                        Square merchant connection: <strong>{squareConnection.status === 'CONNECTED' ? 'AUTHORIZED' : 'LOCATION REQUIRED'}</strong>
                        {' · '}{squareConnection.mode === 'sandbox' ? 'Sandbox' : 'Production'}
                        {squareConnection.locationName ? ' · ' + squareConnection.locationName : ''}
                      </p>
                    )}
                    {squareConfigured ? (
                      <form action="/api/payments/square/connect" method="post">
                        <button type="submit">{squareConnection && squareConnection.mode === squareMode ? 'Reconnect Square account' : 'Connect Square business account'}</button>
                      </form>
                    ) : (
                      <p className={styles.unavailable}>Square connection requires ICA platform setup before business owners can connect.</p>
                    )}
                    {squareConfigured && squareConnection?.merchantId && (
                      <form action="/api/payments/square/check" method="post">
                        <button className={styles.secondaryButton} type="submit">Check and repair connection</button>
                      </form>
                    )}
                    {squareLocations.length > 0 && (
                      <form action="/api/payments/square/location" method="post">
                        <label htmlFor="square-location">Choose where your business takes payments</label>
                        <select id="square-location" name="locationId" required>
                          <option value="">Choose your Square location</option>
                          {squareLocations.map((location) => (
                            <option key={location.id} value={location.id}>{location.name}</option>
                          ))}
                        </select>
                        <button type="submit">Save payment location</button>
                      </form>
                    )}
                    {squareCollectionReady && preferredProvider !== 'SQUARE' && (
                      <form action="/api/payments/provider" method="post">
                        <input type="hidden" name="provider" value="SQUARE" />
                        <button type="submit">Use Square for customer checkouts</button>
                      </form>
                    )}
                    {squareCollectionReady && preferredProvider === 'SQUARE' && (
                      <p className={styles.connection}>Selected for customer checkouts</p>
                    )}
                    <p className={styles.unavailable}>
                      {squareCollectionReady
                        ? 'Square hosted checkout is explicitly enabled for this environment. Verify sandbox and live reconciliation before release.'
                        : 'Square account authorization is a beta. Customer checkout remains disabled until payment verification is approved.'}
                    </p>
                  </div>
                ) : (
                  <p className={styles.unavailable}>
                    This processor is planned. It cannot be selected for live transactions yet.
                  </p>
                )}
              </article>
            );
          })}
        </div>
      </section>

      <div className={styles.footerActions}>
        <Link href="/workspace/workflows">Set up membership dues or an event</Link>
        <Link href="/workspace/billing">Manage your Unified subscription</Link>
      </div>
    </main>
  );
}
