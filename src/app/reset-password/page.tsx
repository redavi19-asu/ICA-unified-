'use client';

import { FormEvent, Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import styles from '../account-recovery.module.css';

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<main className={styles.shell}><section className={styles.card}><p className={styles.copy}>Loading secure reset…</p></section></main>}>
      <ResetPasswordForm />
    </Suspense>
  );
}

function ResetPasswordForm() {
  const params = useSearchParams();
  const token = params.get('token') || '';
  const [message, setMessage] = useState('');
  const [ok, setOk] = useState(false);
  const [working, setWorking] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const password = String(form.get('password') || '');
    const confirm = String(form.get('confirm') || '');
    if (password !== confirm) return setMessage('The passwords do not match.');

    setWorking(true);
    const response = await fetch('/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, password }),
    });
    const data = await response.json();
    setOk(response.ok);
    setMessage(response.ok ? 'Password updated. You can sign in now.' : (data.error || 'Unable to reset password.'));
    setWorking(false);
  }

  return <main className={styles.shell}><section className={styles.card}>
    <a className={styles.back} href="/login">← CUSTOMER LOGIN</a>
    <p className={styles.kicker}>ICA UNIFIED / SECURE RESET</p>
    <h1>Choose a new password.</h1>
    <p className={styles.copy}>Use at least 12 characters. Reset links are single-use and expire after one hour.</p>
    {!ok ? <form className={styles.form} onSubmit={submit}>
      <label>New password<input type="password" name="password" minLength={12} required autoComplete="new-password" /></label>
      <label>Confirm password<input type="password" name="confirm" minLength={12} required autoComplete="new-password" /></label>
      <button disabled={working || !token}>{working ? 'UPDATING…' : 'UPDATE PASSWORD'}</button>
    </form> : <a className={styles.back} href="/login">SIGN IN TO ICA UNIFIED →</a>}
    {message ? <p className={`${styles.message} ${ok ? styles.success : styles.error}`}>{message}</p> : null}
  </section></main>;
}