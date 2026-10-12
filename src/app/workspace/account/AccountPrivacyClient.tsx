'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

type RequestRow = {
  id: string;
  scope: 'ACCOUNT' | 'ORGANIZATION';
  status: string;
  requestedAt: string;
  message: string | null;
  expectedCompletionAt: string | null;
  confirmationRequired: boolean;
  receiptUrl: string | null;
};

export default function AccountPrivacyClient({
  organizationName,
  membershipCount,
  role,
  userName,
  email,
}: {
  organizationName: string;
  membershipCount: number;
  role: string;
  userName: string;
  email: string;
}) {
  const [confirmation, setConfirmation] = useState('');
  const [working, setWorking] = useState('');
  const [message, setMessage] = useState('');
  const [requests, setRequests] = useState<RequestRow[]>([]);

  async function refresh() {
    const response = await fetch('/api/account/deletion-request', { cache: 'no-store' });
    const data = await response.json().catch(() => ({}));
    if (response.ok) setRequests(data.requests || []);
  }

  useEffect(() => { void refresh(); }, []);

  async function requestDeletion(scope: 'ACCOUNT' | 'ORGANIZATION') {
    if (confirmation !== 'DELETE') return;
    setWorking(scope);
    setMessage('');
    try {
      const response = await fetch('/api/account/deletion-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope, confirmation, allMemberships: scope === 'ACCOUNT' }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Unable to submit deletion request.');
      setMessage(data.message || 'Deletion request submitted.');
      setConfirmation('');
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to submit deletion request.');
    } finally {
      setWorking('');
    }
  }

  const accountPending = requests.some((item) => item.scope === 'ACCOUNT' && ['PENDING','UNDER_REVIEW','NEEDS_INFORMATION'].includes(item.status) && !item.confirmationRequired);
  const organizationPending = requests.some((item) => item.scope === 'ORGANIZATION' && ['PENDING','UNDER_REVIEW','NEEDS_INFORMATION'].includes(item.status));

  return (
    <main className="account-privacy-shell">
      <section className="account-privacy-card">
        <Link className="account-privacy-back" href="/workspace">← BACK TO ICA UNIFIED</Link>
        <small>ICA UNIFIED / ACCOUNT & PRIVACY</small>
        <h1>Control your account.</h1>
        <p>{userName} · {email}<br />{organizationName} · {role}</p>

        <div className="account-policy-links">
          <Link href="/privacy">PRIVACY POLICY</Link>
          <Link href="/terms">TERMS</Link>
          <Link href="/acceptable-use">ACCEPTABLE USE</Link>
          <Link href="/account-deletion">DELETION POLICY</Link>
        </div>

        <div className="account-delete-grid">
          <article className="account-delete-panel danger">
            <h2>Request account deletion</h2>
            <p>Removes your account from all {membershipCount} Unified workspace memberships after review. Transfer any sole-owner responsibility first. Account access and personal login data are removed when completion is confirmed; limited de-identified training/compliance history is kept for 90 days, then automatically purged. Company workspaces and their billing are not silently deleted or cancelled.</p>
            <input value={confirmation} onChange={(event) => setConfirmation(event.target.value.toUpperCase())} placeholder="Type DELETE to confirm" />
            <button disabled={working !== '' || confirmation !== 'DELETE' || accountPending} onClick={() => requestDeletion('ACCOUNT')}>
              {accountPending ? 'ACCOUNT DELETION REQUEST PENDING' : working === 'ACCOUNT' ? 'SUBMITTING…' : 'REQUEST ACCOUNT DELETION'}
            </button>
          </article>

          {role === 'OWNER' && (
            <article className="account-delete-panel danger">
              <h2>Request workspace deletion</h2>
              <p>Requests closure and deletion review for {organizationName}. Because this can affect members, credentials, courses, documents, billing, and audit records, ICA verifies ownership before final removal.</p>
              <input value={confirmation} onChange={(event) => setConfirmation(event.target.value.toUpperCase())} placeholder="Type DELETE to confirm" />
              <button disabled={working !== '' || confirmation !== 'DELETE' || organizationPending} onClick={() => requestDeletion('ORGANIZATION')}>
                {organizationPending ? 'WORKSPACE DELETION REQUEST PENDING' : working === 'ORGANIZATION' ? 'SUBMITTING…' : 'REQUEST WORKSPACE DELETION'}
              </button>
            </article>
          )}
        </div>

        {requests.map(item => <section className="account-delete-status" key={item.id}>
          <strong>{item.scope === 'ACCOUNT' ? 'Account' : 'Workspace'}: {item.status.replaceAll('_', ' ')}</strong>
          {item.confirmationRequired && <p>Confirm account removal again above to authorize removal from all Unified workspaces.</p>}
          {item.message && <p>{item.message}</p>}
          {item.receiptUrl && <p><a href={item.receiptUrl}>Save your private status and completion link →</a></p>}
          {item.expectedCompletionAt && <p>Expected completion: {new Date(item.expectedCompletionAt).toLocaleDateString()}</p>}
        </section>)}

        {message && <div className="account-delete-status" role="status">{message}</div>}
      </section>
    </main>
  );
}
