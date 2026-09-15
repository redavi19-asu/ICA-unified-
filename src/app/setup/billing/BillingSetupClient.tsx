'use client';

import { useState } from 'react';
import styles from './billing-setup.module.css';

export default function BillingSetupClient({
  organizationName,
  monthlyPrice,
  stripeReady,
  cancelled,
  confirmationFailed,
}: {
  organizationName: string;
  monthlyPrice: number;
  stripeReady: boolean;
  cancelled: boolean;
  confirmationFailed: boolean;
}) {
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');

  async function openCheckout() {
    setWorking(true);
    setError('');
    try {
      const response = await fetch('/api/billing/checkout', { method: 'POST' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to open Stripe Checkout.');
      window.location.assign(data.checkoutUrl);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to open Stripe Checkout.');
      setWorking(false);
    }
  }

  return (
    <main className={styles.shell}>
      <div className={styles.glow} />
      <a href="/" className={styles.brand}>ICA <span>UNIFIED</span></a>

      <section className={styles.wrap}>
        <div className={styles.copyColumn}>
          <p className={styles.eyebrow}>STEP 2 OF 3 · ACTIVATE PROFESSIONAL</p>
          <h1>Your company exists.<br/>Now turn on the platform.</h1>
          <p className={styles.lede}>
            {organizationName} has been created securely. Add a payment method through Stripe to begin
            the 14-day ICA Unified Professional trial. Nothing is charged today.
          </p>

          <div className={styles.timeline}>
            <div className={styles.done}><span>01</span><strong>Company created</strong><small>Organization + Owner account</small></div>
            <div className={styles.current}><span>02</span><strong>Secure billing</strong><small>Stripe-hosted checkout</small></div>
            <div><span>03</span><strong>Get the apps</strong><small>Web · Windows · Mac</small></div>
          </div>

          <div className={styles.trust}>
            <span>✓ Standard Support included</span>
            <span>✓ Cancel before trial ends to avoid charge</span>
            <span>✓ One organization subscription across supported devices</span>
            <span>✓ Payment information handled by Stripe</span>
          </div>
        </div>

        <aside className={styles.checkoutCard}>
          <div className={styles.planHead}>
            <div><small>ICA UNIFIED</small><h2>Professional</h2></div>
            <span>14-DAY TRIAL</span>
          </div>

          <div className={styles.price}>
            <strong>$0</strong>
            <span>due today</span>
          </div>

          <div className={styles.line}><span>After 14 days</span><strong>${monthlyPrice}/month</strong></div>
          <div className={styles.line}><span>Billing cadence</span><strong>Monthly</strong></div>
          <div className={styles.line}><span>Standard support</span><strong>Included</strong></div>
          <div className={styles.line}><span>Platform access</span><strong>Web + Apps</strong></div>

          {cancelled && <p className={styles.notice}>Checkout was cancelled. Your ICA company record is still safe.</p>}
          {confirmationFailed && <p className={styles.error}>Stripe returned to ICA, but the subscription could not be confirmed. Please try again.</p>}
          {error && <p className={styles.error}>{error}</p>}

          <button onClick={openCheckout} disabled={working || !stripeReady} className={styles.checkoutButton}>
            {working ? 'OPENING STRIPE…' : stripeReady ? 'CONTINUE TO STRIPE →' : 'STRIPE ACTIVATION PENDING'}
          </button>

          {!stripeReady && (
            <div className={styles.pending}>
              <b>ICA IS READY FOR STRIPE</b>
              <span>The customer flow is finished. Production checkout activates as soon as the ICA Worker receives the Stripe secret key and Professional price ID.</span>
            </div>
          )}

          <p className={styles.fine}>
            Stripe securely collects and stores payment details. ICA Unified does not store raw card numbers.
          </p>
        </aside>
      </section>
    </main>
  );
}
