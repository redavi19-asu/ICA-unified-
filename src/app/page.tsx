'use client';

import { useMemo, useState } from 'react';

type Workspace = 'pulse' | 'learning' | 'people' | 'credentials' | 'documents';

const workspaceCopy: Record<Workspace, { score: number; label: string; description: string }> = {
  pulse: { score: 94, label: 'Operations Pulse', description: 'A live view of learning, people, credentials, documents, and approvals.' },
  learning: { score: 91, label: 'Learning Field', description: 'Assignments, courses, completion, and overdue work without menu hunting.' },
  people: { score: 96, label: 'People Field', description: 'Employees, onboarding, managers, roles, and workforce status in one place.' },
  credentials: { score: 89, label: 'Credential Field', description: 'Certificates, licenses, renewals, expirations, and compliance attention.' },
  documents: { score: 98, label: 'Document Field', description: 'Policies, acknowledgments, employee files, and controlled documents.' },
};

const nodes = [
  { key: 'learning' as Workspace, title: 'LEARNING / 04', detail: '4 overdue assignments', className: 'node node-learning' },
  { key: 'people' as Workspace, title: 'PEOPLE / 48', detail: '2 onboarding', className: 'node node-people' },
  { key: 'credentials' as Workspace, title: 'CREDENTIALS / 03', detail: '3 expiring soon', className: 'node node-credentials' },
  { key: 'documents' as Workspace, title: 'DOCUMENTS / 02', detail: '2 need action', className: 'node node-documents' },
];

export default function Home() {
  const [workspace, setWorkspace] = useState<Workspace>('pulse');
  const [message, setMessage] = useState('Select a live field. The workspace reshapes around the task instead of sending you through a maze of pages.');
  const active = workspaceCopy[workspace];
  const activity = useMemo(() => [
    ['Marcus finished Safety 02', 'Certificate generated automatically'],
    ['Credential approaching expiration', 'Driver certification · 12 days'],
    ['New employee entered system', 'Onboarding path created'],
    ['Manager approval requested', 'Policy acknowledgment'],
  ], []);

  return (
    <main className="shell">
      <aside className="edge-rail" aria-label="Workspace navigation">
        <div className="brand-mark">IU</div>
        {(['pulse', 'learning', 'people', 'credentials', 'documents'] as Workspace[]).map((item, index) => (
          <button
            key={item}
            className={workspace === item ? 'rail-control active' : 'rail-control'}
            onClick={() => {
              setWorkspace(item);
              setMessage(`${workspaceCopy[item].label} activated.`);
            }}
            aria-label={workspaceCopy[item].label}
          >
            {['◉', '△', '◎', '◇', '▤'][index]}
          </button>
        ))}
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">I COMPUTER ANYTHING / UNIFIED OPERATIONS</p>
            <h1>ICA<br />UNIFIED</h1>
            <p className="subline">LMS + AMS Business Management Platform</p>
          </div>
          <div className="system-health">
            <span>SYSTEM HEALTH</span>
            <div className="signal" aria-hidden="true"><i /><i /><i /><i /></div>
            <strong>LIVE</strong>
          </div>
        </header>

        <div className="workspace-grid">
          <section className="field-map" aria-label="Unified business system map">
            <div className="ring ring-one" />
            <div className="ring ring-two" />
            <div className="core-score">
              <span>{active.label}</span>
              <strong>{active.score}</strong>
              <small>% aligned</small>
              <i className="core-dot" />
            </div>
            {nodes.map((node) => (
              <button
                key={node.key}
                className={`${node.className}${workspace === node.key ? ' selected' : ''}`}
                onClick={() => {
                  setWorkspace(node.key);
                  setMessage(`${node.title}: ${node.detail}.`);
                }}
              >
                <b>{node.title}</b>
                <span>{node.detail}</span>
              </button>
            ))}
          </section>

          <aside className="activity-stream">
            <p className="eyebrow">RIGHT NOW</p>
            <h2>Activity stream</h2>
            {activity.map(([title, detail]) => (
              <div className="activity" key={title}>
                <strong>{title}</strong>
                <span>{detail}</span>
              </div>
            ))}
          </aside>
        </div>

        <section className="action-dock" aria-label="Quick actions">
          {['Assign training', '+ Add person', 'Generate report', '⌘ Command'].map((action) => (
            <button key={action} onClick={() => setMessage(`${action} opened in the current workspace.`)}>{action}</button>
          ))}
        </section>

        <section className="metrics" aria-label="Organization metrics">
          <div><span>TRAINING</span><strong>91%</strong></div>
          <div><span>COMPLIANCE</span><strong>94%</strong></div>
          <div><span>ACTIVE PEOPLE</span><strong>48</strong></div>
          <div><span>NEEDS ATTENTION</span><strong>09</strong></div>
        </section>

        <section className="context-panel">
          <div>
            <p className="eyebrow">CURRENT FIELD</p>
            <h2>{active.label}</h2>
          </div>
          <p>{active.description}</p>
        </section>

        <p className="system-message" aria-live="polite">{message}</p>
      </section>
    </main>
  );
}
