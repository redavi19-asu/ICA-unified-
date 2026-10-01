'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import TurnstileWidget from '../TurnstileWidget';
import SocialAuthButtons from '../SocialAuthButtons';
import styles from './register.module.css';

export default function RegisterPage() {
  const router = useRouter();
  const [mode, setMode] = useState<'register' | 'login'>('register');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState('');
  const [turnstileReset, setTurnstileReset] = useState(0);
  const [socialTicket, setSocialTicket] = useState('');
  const [socialProfile, setSocialProfile] = useState<{ provider: string; email: string; displayName: string } | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('mode') === 'login') setMode('login');
    const ticket = params.get('social_ticket') || '';
    if (!ticket) return;
    setSocialTicket(ticket);
    setMode('register');
    fetch('/api/auth/social/profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticket }),
    })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Social onboarding expired.');
        setSocialProfile(data);
      })
      .catch((cause) => setError(cause.message || 'Social onboarding expired.'));
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError('');
    const form = new FormData(event.currentTarget);

    const isLogin = mode === 'login';
    if (!isLogin && socialTicket) {
      const response = await fetch('/api/auth/social/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticket: socialTicket,
          organizationName: form.get('organizationName'),
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error || 'Unable to create workspace.');
        setLoading(false);
        return;
      }
      router.push('/setup/billing');
      router.refresh();
      return;
    }

    const response = await fetch(isLogin ? '/api/auth/login' : '/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(
        isLogin
          ? {
              organizationSlug: form.get('organizationSlug'),
              email: form.get('email'),
              password: form.get('password'),
              turnstileToken,
            }
          : {
              organizationName: form.get('organizationName'),
              name: form.get('name'),
              email: form.get('email'),
              password: form.get('password'),
              turnstileToken,
            }
      ),
    });

    const data = await response.json();
    if (!response.ok) {
      setError(data.error || (isLogin ? 'Unable to sign in.' : 'Unable to create workspace.'));
      setLoading(false);
      setTurnstileToken('');
      setTurnstileReset((value) => value + 1);
      return;
    }

    if (!isLogin && data.verificationRequired) {
      router.push('/verify-email/pending');
      router.refresh();
      return;
    }

    router.push(isLogin ? '/workspace' : '/setup/billing');
    router.refresh();
  }

  return (
    <main className={styles.shell}>
      <section className={styles.manifesto}>
        <Link href="/" className={styles.back}>← BACK TO ICA UNIFIED</Link>
        <p className={styles.kicker}>ICA UNIFIED / ORGANIZATION ACCESS</p>
        <h1>{mode === 'login' ? <>Welcome<br />back.</> : <>Build one<br />place to work.</>}</h1>
        <p>{mode === 'login' ? 'Enter your company workspace to continue learning, administration, credentials, documents, and operations in one connected system.' : 'Launch a private company workspace with learning, people, credentials, documents, and operations already connected.'}</p>
        <div className={styles.orbit}><span /><span /><strong>14</strong><small>DAY TRIAL</small></div>
      </section>

      <section className={styles.formPanel}>
        <div className={styles.authTabs}>
          <button type="button" className={mode === 'register' ? styles.activeTab : ''} onClick={() => { setMode('register'); setError(''); setTurnstileToken(''); setTurnstileReset((value) => value + 1); }}>CREATE COMPANY</button>
          <button type="button" className={mode === 'login' ? styles.activeTab : ''} onClick={() => { setMode('login'); setError(''); setTurnstileToken(''); setTurnstileReset((value) => value + 1); }}>LOG IN</button>
        </div>
        <p className={styles.kicker}>{mode === 'login' ? 'CUSTOMER LOGIN' : 'CREATE ORGANIZATION'}</p>
        <h2>{mode === 'login' ? 'Enter your ICA Unified workspace.' : 'Your company becomes its own tenant.'}</h2>
        {mode === 'register' && !socialProfile && <SocialAuthButtons purpose="register" />}
        {mode === 'login' && <SocialAuthButtons purpose="login" />}
        {socialProfile && (
          <div style={{margin:'0 0 16px',padding:'12px 14px',border:'1px solid rgba(38,138,86,.24)',borderRadius:10,background:'rgba(38,138,86,.08)',fontSize:12}}>
            <strong>{socialProfile.provider.toUpperCase()} VERIFIED</strong><br />
            {socialProfile.displayName} · {socialProfile.email}
          </div>
        )}
        <form onSubmit={submit}>
          {mode === 'register' ? (
            <>
              <label>Company name<input name="organizationName" placeholder="Northstar Services" required minLength={2} /></label>
              {!socialProfile && <label>Your name<input name="name" placeholder="Jordan Brooks" required minLength={2} /></label>}
            </>
          ) : (
            <label>ICA Company ID <span style={{opacity:.55}}>(issued by ICA)</span><input name="organizationSlug" autoComplete="organization" placeholder="ICA-A3F9C2" /></label>
          )}
          {socialProfile ? (
            <label>Work email<input value={socialProfile.email} type="email" readOnly /></label>
          ) : (
            <>
              <label>Work email<input name="email" type="email" autoComplete="email" placeholder="you@company.com" required /></label>
              <label>Password<input name="password" type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={mode === 'login' ? 8 : 12} required />{mode === 'register' && <small>Use at least 12 characters.</small>}</label>
              <TurnstileWidget onToken={setTurnstileToken} resetKey={turnstileReset} theme="light" />
            </>
          )}
          <button disabled={loading || (!socialProfile && Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY) && !turnstileToken)}>{loading ? (mode === 'login' ? 'VERIFYING…' : 'BUILDING WORKSPACE…') : (mode === 'login' ? 'ENTER UNIFIED →' : 'CREATE ICA UNIFIED →')}</button>
          {mode === 'login' && <a className={styles.forgot} href="/forgot-password">Forgot password?</a>}
        </form>
        {error && <p className={styles.error}>{error}</p>}
        <p className={styles.note}>{mode === 'login' ? 'Use the Company ID ICA issued when the organization was created. ICA Master owners can sign in without a Company ID.' : 'The first account becomes the Organization Owner. ICA automatically issues the company a unique Company ID for future sign-in and support. Additional people are added through secure invitations.'}</p>
      </section>
    </main>
  );
}