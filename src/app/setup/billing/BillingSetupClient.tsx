'use client';

import Link from 'next/link';
import { useState } from 'react';
import styles from './billing-setup.module.css';

export default function BillingSetupClient({
  organizationName,
  companyId,
  monthlyPrice,
  stripeReady,
  cancelled,
  confirmationFailed,
  trialExpired,
}: {
  organizationName: string;
  companyId: string;
  monthlyPrice: number;
  stripeReady: boolean;
  cancelled: boolean;
  confirmationFailed: boolean;
  trialExpired: boolean;
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
      <Link href="/" className={styles.brand}>ICA <span>UNIFIED</span></Link>

      <section className={styles.wrap}>
        <div className={styles.copyColumn}>
          <p className={styles.eyebrow}>STEP 2 OF 3 · ACTIVATE PROFESSIONAL</p>
          <h1>Your company exists.<br/>Now turn on the platform.</h1>
          <p className={styles.lede}>
            {organizationName} has been created securely. ICA has issued the organization its own Company ID.
            Add a payment method through Stripe to begin the 14-day ICA Unified Professional trial. Nothing is charged today.
          </p>

          <div className={styles.companyIdCard}>
            <span>YOUR ICA COMPANY ID</span>
            <strong>{companyId}</strong>
            <small>Keep this ID with your organization records. It identifies your ICA workspace for sign-in and support.</small>
          </div>

          <div className={styles.timeline}>
            <div className={styles.done}><span>01</span><strong>Company created</strong><small>Organization + Owner account</small></div>
            <div className={styles.current}><span>02</span><strong>Secure billing</strong><small>Stripe-hosted checkout</small></div>
            <div><span>03</span><strong>Access the platform</strong><small>Web now · apps as released</small></div>
          </div>

          <div className={styles.trust}>
            <span>✓ Standard Support included</span>
            <span>✓ Cancel anytime from Workspace → Billing → Manage or Cancel Subscription</span>
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
          <div className={styles.line}><span>Platform access</span><strong>Web now · apps as released</strong></div>

          {trialExpired && <p className={styles.notice}>Your 14-day ICA trial has ended. Add or restore the company subscription to reopen the workspace.</p>}
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
            Cancel before the 14-day trial ends to avoid the first charge. After the trial, Professional is ${monthlyPrice}/month until canceled.
          </p>
        </aside>
      </section>
    </main>
  );
}