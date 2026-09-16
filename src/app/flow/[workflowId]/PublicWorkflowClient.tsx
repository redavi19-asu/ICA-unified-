'use client';

import Link from 'next/link';
import { FormEvent, useMemo, useState } from 'react';
import TurnstileWidget from '../../TurnstileWidget';
import styles from './public-workflow.module.css';

type WorkflowProps = {
  id: string;
  kind: 'MEMBERSHIP' | 'EVENT';
  name: string;
  organizationName: string;
  config: Record<string, unknown>;
};

export default function PublicWorkflowClient({ workflow }: { workflow: WorkflowProps }) {
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState('');
  const [success, setSuccess] = useState(false);
  const [activationUrl, setActivationUrl] = useState('');
  const [turnstileToken, setTurnstileToken] = useState('');
  const [turnstileReset, setTurnstileReset] = useState(0);

  const details = useMemo(() => {
    const price = Number(workflow.config.price || 0);
    return {
      price: Number.isFinite(price) && price > 0 ? price : 0,
      billingCadence: String(workflow.config.billingCadence || '').replaceAll('_', ' '),
      qualifications: String(workflow.config.qualifications || '').trim(),
      benefits: String(workflow.config.benefits || '').trim(),
      startAt: String(workflow.config.startAt || '').trim(),
      eventType: String(workflow.config.eventType || 'EVENT').replaceAll('_', ' '),
      capacity: Number(workflow.config.capacity || 0),
      credits: Number(workflow.config.ceuCredits || 0),
      category: String(workflow.config.creditCategory || 'GENERAL'),
      applicationRequired: Boolean(workflow.config.applicationRequired),
      approvalRequired: Boolean(workflow.config.approvalRequired),
    };
  }, [workflow.config]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setWorking(true);
    setMessage('');
    setSuccess(false);
    setActivationUrl('');

    const form = new FormData(event.currentTarget);
    const response = await fetch(`/api/public/workflows/${workflow.id}/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: form.get('name'),
        email: form.get('email'),
        phone: form.get('phone'),
        company: form.get('company'),
        notes: form.get('notes'),
        turnstileToken,
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      setMessage(data.error || 'Unable to submit right now.');
      setWorking(false);
      setTurnstileToken('');
      setTurnstileReset((value) => value + 1);
      return;
    }

    if (data.checkoutUrl) {
      window.location.assign(data.checkoutUrl);
      return;
    }

    setSuccess(true);
    setMessage(data.message || 'Submitted successfully.');
    setActivationUrl(data.activationUrl || '');
    setWorking(false);
    setTurnstileToken('');
    setTurnstileReset((value) => value + 1);
    event.currentTarget.reset();
  }

  return (
    <main className={styles.shell}>
      <div className={styles.glow} />
      <header className={styles.brand}>
        <Link href="/">ICA <span>UNIFIED</span></Link>
        <small>{workflow.organizationName}</small>
      </header>

      <section className={styles.layout}>
        <div className={styles.summary}>
          <p className={styles.eyebrow}>{workflow.kind === 'EVENT' ? 'EVENT / WEBINAR' : 'MEMBERSHIP PROGRAM'}</p>
          <h1>{workflow.name}</h1>
          <p className={styles.organization}>Hosted by {workflow.organizationName} through ICA Unified.</p>

          <div className={styles.detailGrid}>
            {workflow.kind === 'EVENT' ? (
              <>
                <Detail label="TYPE" value={details.eventType} />
                <Detail label="DATE / TIME" value={details.startAt ? new Date(details.startAt).toLocaleString() : 'To be announced'} />
                <Detail label="PRICE" value={details.price > 0 ? `$${details.price.toFixed(2)}` : 'FREE'} />
                <Detail label="CAPACITY" value={details.capacity > 0 ? String(details.capacity) : 'OPEN'} />
                <Detail label="CE CREDIT" value={details.credits > 0 ? `${details.credits} ${details.category}` : 'NONE'} />
              </>
            ) : (
              <>
                <Detail label="PRICE" value={details.price > 0 ? `$${details.price.toFixed(2)}` : 'NO FEE'} />
                <Detail label="BILLING" value={details.billingCadence || '—'} />
                <Detail label="REVIEW" value={details.approvalRequired ? 'ADMIN APPROVAL' : 'AUTOMATIC'} />
              </>
            )}
          </div>

          {workflow.kind === 'MEMBERSHIP' && details.qualifications && (
            <section className={styles.copyBlock}>
              <span>QUALIFICATIONS</span>
              <p>{details.qualifications}</p>
            </section>
          )}

          {workflow.kind === 'MEMBERSHIP' && details.benefits && (
            <section className={styles.copyBlock}>
              <span>MEMBER BENEFITS</span>
              <p>{details.benefits}</p>
            </section>
          )}

          {details.price > 0 && (
            <p className={styles.paymentNote}>
              This workflow has a configured fee. If the organization payment connection is not active yet,
              ICA will record your submission as payment pending instead of charging you incorrectly.
            </p>
          )}
        </div>

        <section className={styles.formCard}>
          <p className={styles.eyebrow}>{workflow.kind === 'EVENT' ? 'REGISTRATION' : 'APPLICATION'}</p>
          <h2>{workflow.kind === 'EVENT' ? 'Reserve your place.' : 'Submit your information.'}</h2>

          {!success ? (
            <form onSubmit={submit}>
              <label>Full name<input name="name" required minLength={2} autoComplete="name" /></label>
              <label>Email<input name="email" type="email" required autoComplete="email" /></label>
              <label>Phone<input name="phone" type="tel" autoComplete="tel" /></label>
              <label>Company / organization<input name="company" autoComplete="organization" /></label>
              <label>
                {workflow.kind === 'EVENT' ? 'Notes / accessibility needs' : 'Application notes / qualification details'}
                <textarea name="notes" rows={5} />
              </label>
              <TurnstileWidget onToken={setTurnstileToken} resetKey={turnstileReset} theme="light" />
              <button
                disabled={working || (Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY) && !turnstileToken)}
              >
                {working ? 'SUBMITTING…' : workflow.kind === 'EVENT' ? 'SUBMIT REGISTRATION →' : 'SUBMIT APPLICATION →'}
              </button>
            </form>
          ) : (
            <div className={styles.success}>
              <span>✓ RECEIVED</span>
              <h3>{message}</h3>
              {activationUrl && <a href={activationUrl}>ACTIVATE ICA ACCOUNT →</a>}
              {!activationUrl && <p>Keep an eye on your email for the next step from {workflow.organizationName}.</p>}
            </div>
          )}

          {!success && message && <p className={styles.error} role="alert">{message}</p>}
          <small className={styles.fine}>Your submission is stored only inside this organization’s ICA Unified workspace.</small>
        </section>
      </section>
    </main>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div><span>{label}</span><strong>{value}</strong></div>;
}
