import { organizationFreeAccess } from '../../../lib/master-free-access';
import { redirect } from 'next/navigation';
import { requireSession } from '../../../lib/auth';
import { ensureBillingProfile, PROFESSIONAL_PRICE_CENTS } from '../../../lib/organization-ops';
import styles from './billing.module.css';

export default async function BillingPage() {
  const { membership } = await requireSession();
  const internalWorkspace = membership.organization.plan === 'internal' || membership.organization.slug === 'ica-master';
  const freeAccess = await organizationFreeAccess(membership.organizationId, membership.user.email);
  if (!['OWNER', 'ADMIN'].includes(membership.role)) redirect('/workspace');

  const profile = await ensureBillingProfile(membership.organizationId);
  const billingPortalReady = Boolean((process.env.STRIPE_SECRET_KEY || '').trim() && profile?.providerCustomerId);
  const price = (PROFESSIONAL_PRICE_CENTS / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  });

  return (
    <main className={styles.shell}>
      <a href="/workspace" className={styles.back}>← WORKSPACE</a>
      {internalWorkspace && <p role="status">Internal workspace — no platform subscription payment required. Member dues and event payment processing are configured separately.</p>}
      {!internalWorkspace && freeAccess && <p role="status">Comped — no payment required{freeAccess.expires_at ? ` until ${new Date(freeAccess.expires_at).toLocaleDateString()}` : ''}. Existing paid subscriptions can still be managed below.</p>}
      <header className={styles.header}>
        <div>
          <p>ICA UNIFIED / COMPANY SUBSCRIPTION</p>
          <h1>BILLING<br />CONTROL</h1>
          <span>{membership.organization.name}</span>
        </div>
        <div className={styles.price}>
          <small>{internalWorkspace ? 'INTERNAL WORKSPACE' : 'PROFESSIONAL'}</small>
          <strong>{internalWorkspace ? '$0' : price}</strong>
          <span>{internalWorkspace ? 'no platform subscription required' : 'per month · platform subscription'}</span>
        </div>
      </header>

      <section className={styles.statusGrid}>
        <div><span>WORKSPACE STATUS</span><strong>{membership.organization.status}</strong></div>
        <div><span>ICA PLAN</span><strong>{internalWorkspace ? 'INTERNAL' : profile?.plan?.toUpperCase() || 'PROFESSIONAL'}</strong></div>
        <div><span>PROCESSOR</span><strong>{profile?.provider || 'STRIPE'}</strong></div>
        <div><span>SUBSCRIPTION CONNECTION</span><strong>{profile?.providerSubscriptionId ? profile.subscriptionStatus : internalWorkspace ? 'NOT REQUIRED' : profile?.subscriptionStatus || 'NOT CONNECTED'}</strong></div>
      </section>

      <section className={styles.grid}>
        <article className={styles.primary}>
          <p>PRICING FOUNDATION</p>
          <h2>{internalWorkspace ? 'Internal workspace access is included.' : '$299 is now the system price.'}</h2>
          <p className={styles.copy}>
            {internalWorkspace
              ? 'This ICA internal workspace does not require a paid Professional subscription. Customer organizations use the standard Professional plan. Existing subscriptions, if any, can still be managed below.'
              : "ICA Unified uses Stripe for the organization's $299/month Professional subscription. Trial, active, past-due, and cancellation status are stored against this organization so access follows the company account instead of any single device."}
          </p>
          <div className={styles.line}><span>Monthly platform price</span><strong>{internalWorkspace ? '$0' : price}</strong></div>
          <div className={styles.line}><span>Billing cadence</span><strong>{internalWorkspace ? 'NOT REQUIRED' : 'MONTHLY'}</strong></div>
          <div className={styles.line}><span>Currency</span><strong>USD</strong></div>
          <div className={styles.line}><span>Processor design</span><strong>STRIPE SUBSCRIPTIONS</strong></div>
        </article>

        <article>
          <p>SEPARATE MONEY FLOW</p>
          <h2>Company subscription</h2>
          <p className={styles.copy}>{internalWorkspace ? 'No company subscription payment is required for this internal workspace.' : 'This is the organization paying I Computer Anything for ICA Unified.'}</p>
          <div className={styles.flow}>{internalWorkspace ? 'INTERNAL WORKSPACE · NO PLATFORM FEE' : 'COMPANY → $299/MO → ICA UNIFIED'}</div>
        </article>

        <article>
          <p>BUSINESS CUSTOMER PAYMENTS</p>
          <h2>Payment Hub</h2>
          <p className={styles.copy}>Membership dues and event payments are collected by your business through its own connected provider. They are completely separate from the ICA Unified subscription on this page.</p>
          <div className={styles.billingActions}>
            <a href="/workspace/payments">OPEN BUSINESS PAYMENT HUB →</a>
          </div>
        </article>

        <article className={styles.wide}>
          <p>ICA SUBSCRIPTION</p>
          <h2>Your software subscription stays separate.</h2>
          <div className={styles.readiness}>
            <span><b>✓</b> Organization plan and price record</span>
            <span><b>✓</b> Trial and active organization status handling</span>
            <span><b>✓</b> Stripe subscription checkout and cancellation portal routes</span>
            <span><b>→</b> Actual subscription readiness depends on the live Stripe configuration</span>
          </div>
        </article>

        <article className={styles.wide}>
          <p>ACCOUNT ACCESS</p>
          <h2>Subscription + installation controls.</h2>
          <p className={styles.copy}>{internalWorkspace ? 'This internal workspace requires no platform subscription. Any existing paid subscription can still be managed below.' : 'Company owners and admins can manage or cancel the ICA Unified subscription here. During the 14-day trial, cancel before the trial ends to avoid the first charge. After billing begins, use the same control to cancel the subscription in Stripe.'}</p>
          <div className={styles.billingActions}>
            {billingPortalReady
              ? <form action="/api/billing/portal" method="post"><button type="submit">MANAGE OR CANCEL SUBSCRIPTION →</button></form>
              : <span className={styles.disabledAction}>{internalWorkspace ? 'NO PLATFORM SUBSCRIPTION REQUIRED' : 'STRIPE CUSTOMER NOT CONNECTED'}</span>}
            <a href="/downloads">OPEN ICA ACCESS CENTER →</a>
          </div>
        </article>
      </section>
    </main>
  );
}
