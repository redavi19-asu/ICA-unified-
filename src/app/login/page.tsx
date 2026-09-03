'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './login.module.css';

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

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
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      setError(data.error || 'Unable to sign in.');
      setLoading(false);
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
          <label>Company ID<input name="organizationSlug" autoComplete="organization" placeholder="your-company" required /></label>
          <label>Email<input name="email" type="email" autoComplete="email" placeholder="you@company.com" required /></label>
          <label>Password<input name="password" type="password" autoComplete="current-password" minLength={8} required /></label>
          <button disabled={loading}>{loading ? 'VERIFYING…' : 'ENTER UNIFIED →'}</button>
        </form>
        {error && <p className={styles.error} role="alert">{error}</p>}
        <p className={styles.note}>Your company workspace is isolated from every other organization on the platform.</p>
        <a href="/register" style={{display:'inline-block',marginTop:18,color:'inherit',fontSize:12,letterSpacing:'.08em'}}>CREATE A NEW COMPANY WORKSPACE →</a>
      </section>
    </main>
  );
}
