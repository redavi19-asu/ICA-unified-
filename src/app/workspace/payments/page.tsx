import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireSession } from '../../../lib/auth';
import {
  getOrganizationPaymentAccount,
  refreshOrganizationPaymentAccount,
  stripeConnectConfigured,
} from '../../../lib/member-payments';
import { BUSINESS_PAYMENT_PROVIDERS, providerCanAcceptUnifiedPayments } from '../../../lib/business-payment-providers';
import { getSquareMerchantStatus, squareOauthConfigured, squareConfig } from '../../../lib/square-connect';
import styles from './payments.module.css';

export default async function PaymentHubPage({
  searchParams,
}: {
  searchParams: Promise<{ connect?: string; square?: string }>;
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

  const stripeConfigured = stripeConnectConfigured();
  const stripeReady = stripeConfigured &&
    Boolean(connection?.connectedAccountId && Number(connection.chargesEnabled) && Number(connection.payoutsEnabled));

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

      {(params.square === 'error' || params.square === 'cancelled' || params.square === 'needs-location' || params.square === 'connected') && (
        <p className={params.square === 'error' ? styles.error : styles.notice} role="status">
          {params.square === 'connected'
            ? 'Square business account connected. Customer payments remain unavailable until Square checkout and verification finish testing.'
            : params.square === 'needs-location'
              ? 'Square authorized your account, but no eligible USD card-processing location was found. Check your Square account.'
              : params.square === 'cancelled'
                ? 'Square connection was cancelled. No changes were made to your business payments.'
                : 'Square authorization could not be completed. Try again or contact ICA support.'}
        </p>
      )}

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
                    {active ? 'Ready to collect' : provider.integrationStatus === 'PLANNED' ? 'Not available yet' : 'Not connected'}
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
                    <p className={styles.unavailable}>Account authorization is in development. Square customer checkouts are not enabled yet.</p>
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
