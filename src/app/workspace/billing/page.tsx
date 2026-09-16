import { redirect } from 'next/navigation';
import { requireSession } from '../../../lib/auth';
import { ensureBillingProfile, PROFESSIONAL_PRICE_CENTS } from '../../../lib/organization-ops';
import styles from './billing.module.css';

export default async function BillingPage() {
  const { membership } = await requireSession();
  if (!['OWNER', 'ADMIN'].includes(membership.role)) redirect('/workspace');

  const profile = await ensureBillingProfile(membership.organizationId);
  const price = (PROFESSIONAL_PRICE_CENTS / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  });

  return (
    <main className={styles.shell}>
      <a href="/workspace" className={styles.back}>← WORKSPACE</a>
      <header className={styles.header}>
        <div>
          <p>ICA UNIFIED / COMPANY SUBSCRIPTION</p>
          <h1>BILLING<br />CONTROL</h1>
          <span>{membership.organization.name}</span>
        </div>
        <div className={styles.price}>
          <small>PROFESSIONAL</small>
          <strong>{price}</strong>
          <span>per month · platform subscription</span>
        </div>
      </header>

      <section className={styles.statusGrid}>
        <div><span>WORKSPACE STATUS</span><strong>{membership.organization.status}</strong></div>
        <div><span>ICA PLAN</span><strong>{profile?.plan?.toUpperCase() || 'PROFESSIONAL'}</strong></div>
        <div><span>PROCESSOR</span><strong>{profile?.provider || 'STRIPE'}</strong></div>
        <div><span>SUBSCRIPTION CONNECTION</span><strong>{profile?.subscriptionStatus || 'NOT CONNECTED'}</strong></div>
      </section>

      <section className={styles.grid}>
        <article className={styles.primary}>
          <p>PRICING FOUNDATION</p>
          <h2>$249 is now the system price.</h2>
          <p className={styles.copy}>
            ICA Unified uses Stripe for the organization&apos;s $249/month Professional subscription.
            Trial, active, past-due, and cancellation status are stored against this organization so access
            follows the company account instead of any single device.
          </p>
          <div className={styles.line}><span>Monthly platform price</span><strong>{price}</strong></div>
          <div className={styles.line}><span>Billing cadence</span><strong>MONTHLY</strong></div>
          <div className={styles.line}><span>Currency</span><strong>USD</strong></div>
          <div className={styles.line}><span>Processor design</span><strong>STRIPE SUBSCRIPTIONS</strong></div>
        </article>

        <article>
          <p>SEPARATE MONEY FLOW</p>
          <h2>Company subscription</h2>
          <p className={styles.copy}>This is the organization paying I Computer Anything for ICA Unified.</p>
          <div className={styles.flow}>COMPANY → $249/MO → ICA UNIFIED</div>
        </article>

        <article>
          <p>MEMBER MONEY</p>
          <h2>Dues + event payments</h2>
          <p className={styles.copy}>Member dues and event fees remain separate from your $249 SaaS revenue. Stripe Connect will route those funds to the organization when that account layer is connected.</p>
          <div className={styles.flow}>MEMBER → ORGANIZATION CONNECTED ACCOUNT</div>
        </article>

        <article className={styles.wide}>
          <p>WHAT IS READY NOW</p>
          <h2>The account-dependent parts have a place to plug in.</h2>
          <div className={styles.readiness}>
            <span><b>✓</b> Organization plan + price record</span>
            <span><b>✓</b> Trial / active organization state</span>
            <span><b>✓</b> Provider customer/subscription ID fields</span>
            <span><b>✓</b> Separate member-payment architecture</span>
            <span><b>✓</b> Stripe Checkout path + subscription status sync</span>
            <span><b>→</b> Stripe Connect remains separate for future member dues/event processing</span>
          </div>
        </article>

        <article className={styles.wide}>
          <p>ACCOUNT ACCESS</p>
          <h2>Subscription + installation controls.</h2>
          <p className={styles.copy}>Owners and admins can manage the company subscription in Stripe and open the ICA access center for the web app and any released ICA clients.</p>
          <div className={styles.billingActions}>
            <form action="/api/billing/portal" method="post"><button type="submit">MANAGE SUBSCRIPTION →</button></form>
            <a href="/downloads">OPEN ICA ACCESS CENTER →</a>
          </div>
        </article>
      </section>
    </main>
  );
}
