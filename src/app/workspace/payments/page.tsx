import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireSession } from '../../../lib/auth';
import {
  getOrganizationPaymentAccount,
  refreshOrganizationPaymentAccount,
  stripeConnectConfigured,
} from '../../../lib/member-payments';
import { BUSINESS_PAYMENT_PROVIDERS, providerCanAcceptUnifiedPayments } from '../../../lib/business-payment-providers';
import styles from './payments.module.css';

export default async function PaymentHubPage({
  searchParams,
}: {
  searchParams: Promise<{ connect?: string }>;
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
