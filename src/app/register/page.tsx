'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import TurnstileWidget from '../TurnstileWidget';
import styles from './register.module.css';

export default function RegisterPage() {
  const router = useRouter();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState('');
  const [turnstileReset, setTurnstileReset] = useState(0);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError('');
    const form = new FormData(event.currentTarget);

    const response = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        organizationName: form.get('organizationName'),
        name: form.get('name'),
        email: form.get('email'),
        password: form.get('password'),
        turnstileToken,
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      setError(data.error || 'Unable to create workspace.');
      setLoading(false);
      setTurnstileToken('');
      setTurnstileReset((value) => value + 1);
      return;
    }

    if (data.verificationRequired) {
      router.push('/verify-email/pending');
      router.refresh();
      return;
    }

    router.push('/setup/billing');
    router.refresh();
  }

  return (
    <main className={styles.shell}>
      <section className={styles.manifesto}>
        <a href="/" className={styles.back}>← BACK TO ICA UNIFIED</a>
        <p className={styles.kicker}>ICA UNIFIED / NEW ORGANIZATION</p>
        <h1>Build one<br />place to work.</h1>
        <p>Launch a private company workspace with learning, people, credentials, documents, and operations already connected.</p>
        <div className={styles.orbit}><span /><span /><strong>14</strong><small>DAY TRIAL</small></div>
      </section>

      <section className={styles.formPanel}>
        <p className={styles.kicker}>CREATE ORGANIZATION</p>
        <h2>Your company becomes its own tenant.</h2>
        <form onSubmit={submit}>
          <label>Company name<input name="organizationName" placeholder="Northstar Services" required minLength={2} /></label>
          <label>Your name<input name="name" placeholder="Jordan Brooks" required minLength={2} /></label>
          <label>Work email<input name="email" type="email" placeholder="you@company.com" required /></label>
          <label>Password<input name="password" type="password" minLength={8} required /></label>
          <TurnstileWidget onToken={setTurnstileToken} resetKey={turnstileReset} theme="light" />
          <button disabled={loading || (Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY) && !turnstileToken)}>{loading ? 'BUILDING WORKSPACE…' : 'CREATE ICA UNIFIED →'}</button>
        </form>
        {error && <p className={styles.error}>{error}</p>}
        <p className={styles.note}>The first account becomes the Organization Owner. ICA automatically issues the company a unique Company ID for future sign-in and support. Additional people are added through secure invitations.</p>
      </section>
    </main>
  );
}