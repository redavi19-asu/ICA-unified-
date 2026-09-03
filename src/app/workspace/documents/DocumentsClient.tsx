'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './documents.module.css';

type DocumentItem = {
  id: string;
  title: string;
  version: string;
  requiresAck: boolean;
  createdAt: string;
  acknowledged: number;
};

export default function DocumentsClient({ organizationName, role, documents: initialDocuments }: {
  organizationName: string;
  role: string;
  documents: DocumentItem[];
}) {
  const router = useRouter();
  const [documents, setDocuments] = useState(initialDocuments);
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('Document control ready.');
  const canManage = ['OWNER', 'ADMIN', 'MANAGER'].includes(role);

  async function createDocument(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const response = await fetch('/api/documents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: form.get('title'),
        version: form.get('version'),
        requiresAck: form.get('requiresAck') === 'on',
      }),
    });
    const data = await response.json();
    if (!response.ok) {
      setMessage(data.error || 'Unable to create document.');
      return;
    }
    setDocuments((current) => [{ ...data.document, createdAt: data.document.createdAt, acknowledged: 0 }, ...current]);
    setOpen(false);
    setMessage(`${data.document.title} added to controlled documents.`);
    event.currentTarget.reset();
  }

  return (
    <main className={styles.shell}>
      <button className={styles.back} onClick={() => router.push('/workspace')}>← CONTROL PLANE</button>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>{organizationName.toUpperCase()} / RECORD CONTROL</p>
          <h1>DOCUMENT<br/>FIELD</h1>
          <p>Policies, procedures, controlled versions, and employee acknowledgments in one place.</p>
        </div>
        {canManage && <button className={styles.create} onClick={() => setOpen((value) => !value)}>+ NEW DOCUMENT</button>}
      </header>

      <section className={styles.metrics}>
        <Metric label="CONTROLLED" value={documents.length} />
        <Metric label="ACK REQUIRED" value={documents.filter((item) => item.requiresAck).length} />
        <Metric label="REFERENCE" value={documents.filter((item) => !item.requiresAck).length} />
        <Metric label="ACK EVENTS" value={documents.reduce((sum, item) => sum + item.acknowledged, 0)} />
      </section>

      {open && (
        <form className={styles.builder} onSubmit={createDocument}>
          <label>DOCUMENT TITLE<input name="title" placeholder="Employee Conduct Policy" required /></label>
          <label>VERSION<input name="version" defaultValue="1.0" required /></label>
          <label className={styles.check}><input name="requiresAck" type="checkbox" /> Require employee acknowledgment</label>
          <button>CREATE CONTROLLED RECORD →</button>
        </form>
      )}

      <section className={styles.stack}>
        {documents.length === 0 ? <p className={styles.empty}>No documents yet.</p> : documents.map((document, index) => (
          <article className={styles.document} key={document.id}>
            <span className={styles.index}>{String(index + 1).padStart(2, '0')}</span>
            <div className={styles.title}><strong>{document.title}</strong><span>Version {document.version} · {new Date(document.createdAt).toLocaleDateString()}</span></div>
            <div><small>MODE</small><b>{document.requiresAck ? 'ACK REQUIRED' : 'REFERENCE'}</b></div>
            <div><small>ACKNOWLEDGED</small><b>{document.acknowledged}</b></div>
          </article>
        ))}
      </section>
      <p className={styles.message}>{message}</p>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div><span>{label}</span><strong>{String(value).padStart(2, '0')}</strong></div>;
}
