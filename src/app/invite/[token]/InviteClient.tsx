'use client';

import { FormEvent, useState } from 'react';
import styles from './invite.module.css';

export default function InviteClient({ token }: { token: string }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [message, setMessage] = useState('Create your password to enter the company workspace.');
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (password !== confirm) {
      setMessage('The passwords do not match.');
      return;
    }
    setLoading(true);
    const response = await fetch('/api/invitations/accept', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, password }),
    });
    const data = await response.json();
    if (!response.ok) {
      setMessage(data.error || 'Unable to accept invitation.');
      setLoading(false);
      return;
    }
    window.location.href = data.redirectTo || '/workspace';
  }

  return (
    <main className={styles.shell}>
      <section className={styles.panel}>
        <p className={styles.eyebrow}>ICA UNIFIED / ACCESS HANDOFF</p>
        <h1>YOU&apos;RE<br />INVITED.</h1>
        <p className={styles.lede}>One account. One company workspace. Learning, people, credentials, documents, and operations connected.</p>
        <form onSubmit={submit} className={styles.form}>
          <label>Password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={12} required autoComplete="new-password" /></label>
          <label>Confirm password<input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} minLength={12} required autoComplete="new-password" /></label>
          <button type="submit" disabled={loading}>{loading ? 'CONNECTING…' : 'ENTER WORKSPACE →'}</button>
        </form>
        <p className={styles.message} aria-live="polite">{message}</p>
      </section>
    </main>
  );
}
