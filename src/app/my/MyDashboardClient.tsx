'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './my.module.css';

type Enrollment = {
  id: string;
  status: string;
  progress: number;
  score: number | null;
  dueAt: string | null;
  completedAt: string | null;
  course: { id: string; title: string; description: string | null; durationMin: number; required: boolean };
};

type Credential = {
  id: string;
  name: string;
  code: string | null;
  status: string;
  issuedAt: string | null;
  expiresAt: string | null;
};

type DocumentItem = {
  id: string;
  title: string;
  version: string;
  requiresAck: boolean;
  acknowledgedAt: string | null;
};

export default function MyDashboardClient({ user, organizationName, enrollments, credentials, documents: initialDocuments }: {
  user: { name: string; email: string; role: string; jobTitle: string | null };
  organizationName: string;
  enrollments: Enrollment[];
  credentials: Credential[];
  documents: DocumentItem[];
}) {
  const router = useRouter();
  const [documents, setDocuments] = useState(initialDocuments);
  const [message, setMessage] = useState(`Welcome back, ${user.name}.`);

  const stats = useMemo(() => ({
    due: enrollments.filter((item) => item.status !== 'COMPLETE').length,
    complete: enrollments.filter((item) => item.status === 'COMPLETE').length,
    credentials: credentials.length,
    documents: documents.filter((item) => item.requiresAck && !item.acknowledgedAt).length,
  }), [credentials.length, documents, enrollments]);

  async function acknowledge(documentId: string) {
    const response = await fetch(`/api/documents/${documentId}/acknowledge`, { method: 'POST' });
    const data = await response.json();
    if (!response.ok) {
      setMessage(data.error || 'Unable to acknowledge document.');
      return;
    }
    setDocuments((current) => current.map((item) => item.id === documentId ? { ...item, acknowledgedAt: data.acknowledgedAt } : item));
    setMessage('Document acknowledged.');
  }

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  }

  return (
    <main className={styles.shell}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>{organizationName.toUpperCase()} / MY WORKSPACE</p>
          <h1>{user.name}</h1>
          <p className={styles.sub}>{user.jobTitle || 'Team member'} · {user.email}</p>
        </div>
        <button className={styles.signout} onClick={logout}>SIGN OUT</button>
      </header>

      <section className={styles.metrics}>
        <Metric label="NEEDS ATTENTION" value={stats.due} />
        <Metric label="COMPLETED" value={stats.complete} />
        <Metric label="CREDENTIALS" value={stats.credentials} />
        <Metric label="DOCS TO ACK" value={stats.documents} />
      </section>

      <section className={styles.heroAction}>
        <div><p className={styles.eyebrow}>NEXT MOVE</p><h2>{stats.due > 0 ? 'Keep your required work moving.' : 'You are caught up.'}</h2><p>ICA Unified puts your training, credentials, deadlines, and required documents in one personal view.</p></div>
        <button onClick={() => router.push('/workspace/learning')}>{stats.due > 0 ? 'CONTINUE TRAINING →' : 'OPEN LEARNING →'}</button>
      </section>

      <section className={styles.grid}>
        <div className={styles.panel}>
          <div className={styles.panelHead}><p className={styles.eyebrow}>MY TRAINING</p><span>{enrollments.length} assignments</span></div>
          {enrollments.length === 0 ? <p className={styles.empty}>No courses are assigned right now.</p> : enrollments.map((item) => (
            <button key={item.id} className={styles.assignment} onClick={() => router.push(`/workspace/learning/${item.course.id}`)}>
              <div><strong>{item.course.title}</strong><span>{item.course.required ? 'Required' : 'Optional'} · {item.course.durationMin} min</span></div>
              <div className={styles.progressWrap}><span>{item.status.replaceAll('_', ' ')}</span><div className={styles.progress}><i style={{ width: `${Math.max(3, item.progress)}%` }} /></div><b>{item.progress}%</b></div>
            </button>
          ))}
        </div>

        <div className={styles.panel}>
          <div className={styles.panelHead}><p className={styles.eyebrow}>MY CREDENTIALS</p><span>{credentials.length} issued</span></div>
          {credentials.length === 0 ? <p className={styles.empty}>Completed-course certificates will appear here.</p> : credentials.map((item) => (
            <article className={styles.credential} key={item.id}>
              <div><strong>{item.name}</strong><span>{item.status.toUpperCase()}</span></div>
              <small>{item.expiresAt ? `Expires ${new Date(item.expiresAt).toLocaleDateString()}` : 'No expiration'}</small>
              {item.code && <code>{item.code}</code>}
            </article>
          ))}
        </div>
      </section>

      <section className={styles.documents}>
        <div className={styles.panelHead}><p className={styles.eyebrow}>MY DOCUMENTS</p><span>Policies & acknowledgments</span></div>
        {documents.length === 0 ? <p className={styles.empty}>No controlled documents are assigned to this workspace yet.</p> : documents.map((item) => (
          <article className={styles.document} key={item.id}>
            <div><strong>{item.title}</strong><span>Version {item.version}</span></div>
            {item.requiresAck ? item.acknowledgedAt ? <span className={styles.done}>ACKNOWLEDGED</span> : <button onClick={() => acknowledge(item.id)}>ACKNOWLEDGE</button> : <span className={styles.done}>REFERENCE</span>}
          </article>
        ))}
      </section>

      <p className={styles.message} aria-live="polite">{message}</p>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div><span>{label}</span><strong>{String(value).padStart(2, '0')}</strong></div>;
}
