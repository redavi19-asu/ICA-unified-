'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './register.module.css';

export default function RegisterPage() {
  const router = useRouter();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

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
        organizationSlug: String(form.get('organizationSlug') || '').toLowerCase().trim(),
        name: form.get('name'),
        email: form.get('email'),
        password: form.get('password'),
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      setError(data.error || 'Unable to create workspace.');
      setLoading(false);
      return;
    }

    router.push('/workspace');
    router.refresh();
  }

  return (
    <main className={styles.shell}>
      <section className={styles.manifesto}>
        <a href="/login" className={styles.back}>← SIGN IN</a>
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
          <label>Company ID<input name="organizationSlug" placeholder="northstar-services" required pattern="[a-z0-9-]+" /></label>
          <label>Your name<input name="name" placeholder="Jordan Brooks" required minLength={2} /></label>
          <label>Work email<input name="email" type="email" placeholder="you@company.com" required /></label>
          <label>Password<input name="password" type="password" minLength={8} required /></label>
          <button disabled={loading}>{loading ? 'BUILDING WORKSPACE…' : 'CREATE ICA UNIFIED →'}</button>
        </form>
        {error && <p className={styles.error}>{error}</p>}
        <p className={styles.note}>The first account becomes the Organization Owner. Additional people are added through secure invitations.</p>
      </section>
    </main>
  );
}
