'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './login.module.css';
import TurnstileWidget from '../TurnstileWidget';

export default function LoginClient() {
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

    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        organizationSlug: form.get('organizationSlug'),
        email: form.get('email'),
        password: form.get('password'),
        turnstileToken,
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      setError(data.error || 'Unable to sign in.');
      setLoading(false);
      setTurnstileToken('');
      setTurnstileReset((value) => value + 1);
      return;
    }

    router.push('/workspace');
    router.refresh();
  }

  return (
    <main className={styles.shell}>
      <section className={styles.identity}>
        <p>I COMPUTER ANYTHING / BUSINESS SYSTEMS</p>
        <h1>ICA<br />UNIFIED</h1>
        <div className={styles.line} />
        <h2>One entrance.<br />Every business layer.</h2>
        <p className={styles.copy}>Learning, workforce administration, credentials, documents, approvals, and operations without bouncing between disconnected systems.</p>
      </section>

      <section className={styles.access}>
        <div className={styles.signal}><span /><span /><span /><span /></div>
        <p className={styles.kicker}>SECURE ORGANIZATION ACCESS</p>
        <h2>Enter your workspace.</h2>
        <form onSubmit={submit}>
          <label>ICA Company ID <span style={{opacity:.55}}>(issued by ICA)</span><input name="organizationSlug" autoComplete="organization" placeholder="ICA-A3F9C2" /></label>
          <label>Email<input name="email" type="email" autoComplete="email" placeholder="you@company.com" required /></label>
          <label>Password<input name="password" type="password" autoComplete="current-password" minLength={8} required /></label>
          <TurnstileWidget onToken={setTurnstileToken} resetKey={turnstileReset} theme="light" />
          <button disabled={loading || (Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY) && !turnstileToken)}>{loading ? 'VERIFYING…' : 'ENTER UNIFIED →'}</button>
        </form>
        {error && <p className={styles.error} role="alert">{error}</p>}
        <p className={styles.note}>Your Company ID is issued automatically when the organization is created. It identifies the correct ICA workspace for sign-in and support. ICA Master owners can sign in without a Company ID.</p>
        <a
          href="/register"
          style={{display:'inline-block',marginTop:20,color:'#171714',fontSize:12,fontWeight:900,letterSpacing:'.08em',textDecoration:'none',borderBottom:'1px solid rgba(23,23,20,.35)',paddingBottom:4}}
        >
          START A 14-DAY ICA UNIFIED TRIAL →
        </a>
      </section>
    </main>
  );
}
