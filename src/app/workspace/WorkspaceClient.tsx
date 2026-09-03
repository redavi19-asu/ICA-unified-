'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

type Workspace = 'pulse' | 'learning' | 'people' | 'credentials' | 'documents';

type Props = {
  userName: string;
  role: string;
  organizationName: string;
  stats: { members: number; courses: number; credentials: number; documents: number };
};

const workspaceCopy: Record<Workspace, { score: number; label: string; description: string }> = {
  pulse: { score: 94, label: 'Operations Pulse', description: 'A live view of learning, people, credentials, documents, and approvals.' },
  learning: { score: 91, label: 'Learning Field', description: 'Assignments, courses, completion, and overdue work without menu hunting.' },
  people: { score: 96, label: 'People Field', description: 'Employees, onboarding, managers, roles, and workforce status in one place.' },
  credentials: { score: 89, label: 'Credential Field', description: 'Certificates, licenses, renewals, expirations, and compliance attention.' },
  documents: { score: 98, label: 'Document Field', description: 'Policies, acknowledgments, employee files, and controlled documents.' },
};

export default function WorkspaceClient({ userName, role, organizationName, stats }: Props) {
  const router = useRouter();
  const [workspace, setWorkspace] = useState<Workspace>('pulse');
  const [message, setMessage] = useState(`Connected to ${organizationName}.`);
  const active = workspaceCopy[workspace];
  const activity = useMemo(() => [
    ['Workspace authenticated', `${userName} · ${role}`],
    ['Tenant boundary active', organizationName],
    ['Learning engine ready', `${stats.courses} courses available`],
    ['Records layer ready', `${stats.documents} controlled documents`],
  ], [organizationName, role, stats.courses, stats.documents, userName]);

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  }

  function openField(item: Workspace) {
    if (item === 'people') {
      router.push('/workspace/people');
      return;
    }
    setWorkspace(item);
    setMessage(`${workspaceCopy[item].label} activated.`);
  }

  const nodes = [
    { key: 'learning' as Workspace, title: `LEARNING / ${String(stats.courses).padStart(2, '0')}`, detail: `${stats.courses} courses`, className: 'node node-learning' },
    { key: 'people' as Workspace, title: `PEOPLE / ${String(stats.members).padStart(2, '0')}`, detail: `${stats.members} active profiles`, className: 'node node-people' },
    { key: 'credentials' as Workspace, title: `CREDENTIALS / ${String(stats.credentials).padStart(2, '0')}`, detail: `${stats.credentials} tracked`, className: 'node node-credentials' },
    { key: 'documents' as Workspace, title: `DOCUMENTS / ${String(stats.documents).padStart(2, '0')}`, detail: `${stats.documents} controlled`, className: 'node node-documents' },
  ];

  return (
    <main className="shell">
      <aside className="edge-rail" aria-label="Workspace navigation">
        <div className="brand-mark">IU</div>
        {(['pulse', 'learning', 'people', 'credentials', 'documents'] as Workspace[]).map((item, index) => (
          <button key={item} className={workspace === item ? 'rail-control active' : 'rail-control'} onClick={() => openField(item)} aria-label={workspaceCopy[item].label}>
            {['◉', '△', '◎', '◇', '▤'][index]}
          </button>
        ))}
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">{organizationName.toUpperCase()} / UNIFIED OPERATIONS</p>
            <h1>ICA<br />UNIFIED</h1>
            <p className="subline">LMS + AMS Business Management Platform</p>
          </div>
          <div className="system-health">
            <span>{userName.toUpperCase()} · {role}</span>
            <div className="signal" aria-hidden="true"><i /><i /><i /><i /></div>
            <button onClick={logout} style={{background:'transparent',border:'1px solid currentColor',color:'inherit',padding:'8px 12px',cursor:'pointer'}}>SIGN OUT</button>
          </div>
        </header>

        <div className="workspace-grid">
          <section className="field-map" aria-label="Unified business system map">
            <div className="ring ring-one" /><div className="ring ring-two" />
            <div className="core-score"><span>{active.label}</span><strong>{active.score}</strong><small>% aligned</small><i className="core-dot" /></div>
            {nodes.map((node) => (
              <button key={node.key} className={`${node.className}${workspace === node.key ? ' selected' : ''}`} onClick={() => openField(node.key)}>
                <b>{node.title}</b><span>{node.detail}</span>
              </button>
            ))}
          </section>

          <aside className="activity-stream">
            <p className="eyebrow">RIGHT NOW</p><h2>Activity stream</h2>
            {activity.map(([title, detail]) => <div className="activity" key={title}><strong>{title}</strong><span>{detail}</span></div>)}
          </aside>
        </div>

        <section className="action-dock" aria-label="Quick actions">
          <button onClick={() => setMessage(`Assign training opened for ${organizationName}.`)}>Assign training</button>
          <button onClick={() => router.push('/workspace/people')}>+ Add person</button>
          <button onClick={() => setMessage(`Generate report opened for ${organizationName}.`)}>Generate report</button>
          <button onClick={() => setMessage(`Command opened for ${organizationName}.`)}>⌘ Command</button>
        </section>

        <section className="metrics" aria-label="Organization metrics">
          <div><span>COURSES</span><strong>{stats.courses}</strong></div>
          <div><span>PEOPLE</span><strong>{stats.members}</strong></div>
          <div><span>CREDENTIALS</span><strong>{stats.credentials}</strong></div>
          <div><span>DOCUMENTS</span><strong>{stats.documents}</strong></div>
        </section>

        <section className="context-panel"><div><p className="eyebrow">CURRENT FIELD</p><h2>{active.label}</h2></div><p>{active.description}</p></section>
        <p className="system-message" aria-live="polite">{message}</p>
      </section>
    </main>
  );
}
