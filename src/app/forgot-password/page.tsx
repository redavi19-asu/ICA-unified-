'use client';

import { FormEvent, useState } from 'react';
import styles from '../account-recovery.module.css';

export default function ForgotPasswordPage() {
  const [message, setMessage] = useState('');
  const [working, setWorking] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setWorking(true);
    const form = new FormData(event.currentTarget);
    const response = await fetch('/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: form.get('email') }),
    });
    const data = await response.json();
    setMessage(data.message || 'If that account exists, a reset link will be sent.');
    setWorking(false);
  }

  return <main className={styles.shell}><section className={styles.card}>
    <a className={styles.back} href="/login">← CUSTOMER LOGIN</a>
    <p className={styles.kicker}>ICA UNIFIED / ACCOUNT RECOVERY</p>
    <h1>Reset your password.</h1>
    <p className={styles.copy}>Enter the email on your ICA account. For privacy, ICA gives the same response whether or not the address is registered.</p>
    <form className={styles.form} onSubmit={submit}>
      <label>Email<input type="email" name="email" required autoComplete="email" /></label>
      <button disabled={working}>{working ? 'CHECKING…' : 'SEND RESET LINK'}</button>
    </form>
    {message ? <p className={styles.message}>{message}</p> : null}
  </section></main>;
}
