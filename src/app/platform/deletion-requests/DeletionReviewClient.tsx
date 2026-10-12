'use client';
import { useState } from 'react';

type Row = { id: string; scope: string; status: string; requestedAt: string; userName: string | null;
  email: string | null; organizationName: string | null; message: string | null; expectedCompletionAt: string | null };
type Preview = { memberships: { organizationName: string; role: string }[];
  records: { enrollments: number; credentials: number; acknowledgments: number };
  ownershipTransferRequired: string[]; workspaceDeletion: boolean; globalConfirmationRequired: boolean; retentionDays: number; appleReconnectRequired: boolean };
export default function DeletionReviewClient({ requests }: { requests: Row[] }) {
  return <div>{requests.length ? requests.map(row => <Review key={row.id} row={row} />) : <p>No deletion requests.</p>}</div>;
}
function Review({ row }: { row: Row }) {
  const [currentStatus, setCurrentStatus] = useState(row.status);
  const [identityVerified, setIdentityVerified] = useState(false);
  const [externalReviewed, setExternalReviewed] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [status, setStatus] = useState(row.status === 'NEEDS_INFORMATION' ? 'NEEDS_INFORMATION' : 'UNDER_REVIEW');
  const [message, setMessage] = useState(row.message || '');
  const [date, setDate] = useState(row.expectedCompletionAt?.slice(0, 10) || '');
  const [feedback, setFeedback] = useState('');
  const [working, setWorking] = useState(false);
  const resolved = !['PENDING','UNDER_REVIEW','NEEDS_INFORMATION'].includes(currentStatus);
  async function inspect() {
    setWorking(true);
    try {
      const response = await fetch(`/api/platform/deletion-requests/${encodeURIComponent(row.id)}`, { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to inspect request.');
      setPreview(data);
    } catch (error) { setFeedback(error instanceof Error ? error.message : 'Unable to inspect request.'); }
    finally { setWorking(false); }
  }
  async function save() {
    setWorking(true);
    try {
      const response = await fetch(`/api/platform/deletion-requests/${encodeURIComponent(row.id)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, message, expectedCompletionAt: date ? new Date(`${date}T23:59:59Z`).toISOString() : null }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to save review.');
      setCurrentStatus(status);
      setFeedback('Review saved. The customer can see this update.');
    } catch (error) { setFeedback(error instanceof Error ? error.message : 'Unable to save review.'); }
    finally { setWorking(false); }
  }
  async function complete() {
    setWorking(true);
    try {
      const response = await fetch(`/api/platform/deletion-requests/${encodeURIComponent(row.id)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'COMPLETE', confirmation, identityVerified, externalDataReviewed: externalReviewed }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Deletion did not complete.');
      setCurrentStatus('COMPLETED');
      setFeedback(`Account removal completed. Training archive expiry: ${new Date(data.trainingExpiresAt).toLocaleDateString()}.`);
    } catch (error) { setFeedback(error instanceof Error ? error.message : 'Deletion did not complete.'); }
    finally { setWorking(false); }
  }
  return <article style={{ border: '1px solid #ccd4df', padding: 20, marginTop: 20, borderRadius: 12 }}>
    <h2>{row.userName || 'Removed account'} · {row.scope === 'ACCOUNT' ? 'Account' : 'Workspace'}</h2>
    <p>{row.email || 'No current email'} · {row.organizationName || 'Removed workspace'}</p>
    <p>{currentStatus.replaceAll('_', ' ')} · Requested {new Date(row.requestedAt).toLocaleString()}</p>
    <button disabled={working} onClick={() => void inspect()}>Review scope and ownership</button>
    {preview && <div>
      <p>{preview.memberships.length} workspace memberships · {preview.records.enrollments} learning enrollments · {preview.records.credentials} credentials · {preview.records.acknowledgments} document acknowledgments.</p>
      {preview.ownershipTransferRequired.length > 0 && <p>Ownership transfer required: {preview.ownershipTransferRequired.join(', ')}.</p>}
      {preview.workspaceDeletion && <p>This is a workspace closure request; it must be reviewed separately from removing a member.</p>}
      {!preview.workspaceDeletion && <p>Confirmed completion removes the personal account, all memberships and owned API credentials. Only limited de-identified training/compliance facts are archived for {preview.retentionDays} days.</p>}
      {preview.globalConfirmationRequired && !preview.workspaceDeletion && <p>The account holder must confirm removal from all Unified workspaces in Account &amp; Privacy before completion.</p>}
      {preview.appleReconnectRequired && <p>The account holder needs to sign in with Apple again so its authorization tokens can be revoked.</p>}
      {!resolved && !preview.workspaceDeletion && <div style={{ display: 'grid', gap: 12, marginTop: 16 }}>
        <label><input type="checkbox" checked={identityVerified} onChange={event => setIdentityVerified(event.target.checked)} /> I verified the account holder&apos;s deletion request and identity.</label>
        <label><input type="checkbox" checked={externalReviewed} onChange={event => setExternalReviewed(event.target.checked)} /> Uploaded/shared content, free-text records and outside-provider data have been reviewed and removed where required. Any retained exceptions are documented.</label>
        <label>Type the request ID to confirm: <code>{row.id}</code><input value={confirmation} onChange={event => setConfirmation(event.target.value)} style={{ display: 'block', width: '100%' }} /></label>
        <button disabled={working || currentStatus !== 'UNDER_REVIEW' || !identityVerified || !externalReviewed || confirmation !== row.id || preview.globalConfirmationRequired || preview.appleReconnectRequired || preview.ownershipTransferRequired.length > 0} onClick={() => void complete()}>Complete account removal</button>
      </div>}
    </div>}
    {!resolved && <div style={{ display: 'grid', gap: 12, marginTop: 16 }}>
      <label>Review status <select value={status} onChange={event => setStatus(event.target.value)}>
        <option value="UNDER_REVIEW">Under review</option><option value="NEEDS_INFORMATION">Needs information</option>
      </select></label>
      <label>Update visible to the customer<textarea value={message} onChange={event => setMessage(event.target.value)} maxLength={1000} rows={3} style={{ display: 'block', width: '100%' }} /></label>
      <label>Expected completion date, if known <input type="date" value={date} onChange={event => setDate(event.target.value)} /></label>
      <button disabled={working || message.trim().length < 10} onClick={() => void save()}>Save review update</button>
    </div>}
    {feedback && <p role="status">{feedback}</p>}
  </article>;
}
