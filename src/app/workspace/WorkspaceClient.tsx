'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

type Props = {
  userName: string;
  role: string;
  organizationName: string;
  stats: { members: number; courses: number; credentials: number; documents: number };
};

type Appearance = 'COMMAND' | 'EXECUTIVE';

type AppearanceState = {
  orgDefault: Appearance;
  userOverride: Appearance | null;
  effective: Appearance;
  canManageOrganization: boolean;
};

export default function WorkspaceClient({ userName, role, organizationName, stats }: Props) {
  const router = useRouter();
  const [appearance, setAppearance] = useState<Appearance>('COMMAND');
  const [appearanceState, setAppearanceState] = useState<AppearanceState>({
    orgDefault: 'COMMAND',
    userOverride: null,
    effective: 'COMMAND',
    canManageOrganization: role === 'OWNER' || role === 'ADMIN',
  });
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const [appearanceBusy, setAppearanceBusy] = useState(false);

  useEffect(() => {
    let active = true;

    fetch('/api/preferences/appearance')
      .then((response) => response.ok ? response.json() : null)
      .then((data: AppearanceState | null) => {
        if (!active || !data) return;
        setAppearanceState(data);
        setAppearance(data.effective);
      })
      .catch(() => {
        // Keep Command as the safe fallback if preference loading is unavailable.
      });

    return () => {
      active = false;
    };
  }, []);

  async function updateAppearance(scope: 'organization' | 'user', nextAppearance: Appearance | null) {
    setAppearanceBusy(true);

    try {
      const response = await fetch('/api/preferences/appearance', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope, appearance: nextAppearance }),
      });

      const data = await response.json();
      if (!response.ok) return;

      setAppearanceState(data);
      setAppearance(data.effective);
    } finally {
      setAppearanceBusy(false);
    }
  }

  const completion = useMemo(() => Math.max(0, Math.min(100, stats.courses ? Math.round((stats.credentials / Math.max(stats.courses, 1)) * 68) : 0)), [stats.courses, stats.credentials]);
  const compliant = Math.max(0, Math.min(100, stats.documents ? 85 : 0));
  const firstName = userName.split(' ')[0] || userName;

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  }

  return (
    <main className="dashboard-shell" data-workspace-appearance={appearance.toLowerCase()}>
      <aside className="dashboard-sidebar">
        <button className="dashboard-brand" onClick={() => router.push('/workspace')} aria-label="ICA Unified dashboard">
          <span>ICA</span>
          <strong>UNIFIED</strong>
          <small>LEARNING • PEOPLE • COMPLIANCE</small>
        </button>

        <nav className="dashboard-nav" aria-label="Primary navigation">
          <button className="active" onClick={() => router.push('/workspace')}>⌂ <span>Dashboard</span></button>
          <p>MANAGEMENT</p>
          <button onClick={() => router.push('/workspace/learning')}>▥ <span>Learning</span></button>
          <button onClick={() => router.push('/workspace/people')}>♙ <span>People</span></button>
          <button onClick={() => router.push('/workspace/credentials')}>⬡ <span>Credentials</span></button>
          <button onClick={() => router.push('/workspace/documents')}>▤ <span>Documents</span></button>
          <button onClick={() => router.push('/workspace/reports')}>▥ <span>Reports</span></button>
          <p>COMPANY SETTINGS</p>
          <button onClick={() => router.push('/workspace/people')}>◈ <span>Roles & Permissions</span></button>
          <button onClick={() => router.push('/workspace/reports')}>⌁ <span>Integrations</span></button>
          <button onClick={() => router.push('/workspace/reports')}>▣ <span>Billing</span></button>
          <p>PLATFORM</p>
          <button onClick={() => router.push('/platform')}>◇ <span>Platform Admin</span></button>
        </nav>

        <div className="dashboard-help">
          <strong>Need Help?</strong>
          <span>Open reports, people, or training controls from this workspace.</span>
          <button onClick={() => router.push('/workspace/reports')}>Get Help</button>
        </div>
      </aside>

      <section className="dashboard-main">
        <header className="dashboard-topbar">
          <div className="company-switcher">
            <span>Company Workspace</span>
            <button>{organizationName} <b>⌄</b></button>
            <i>● Active</i>
          </div>
          <div className="dashboard-user">
            <button
              className="appearance-trigger"
              type="button"
              onClick={() => setAppearanceOpen((open) => !open)}
              aria-expanded={appearanceOpen}
            >
              <span>Appearance</span>
              <strong>{appearance === 'EXECUTIVE' ? 'Executive' : 'Command'}</strong>
            </button>
            <div><strong>{userName}</strong><span>{role}</span></div>
            <button onClick={logout}>Sign out</button>
          </div>

          {appearanceOpen && (
            <aside className="appearance-panel" aria-label="Dashboard appearance">
              <div className="appearance-panel-head">
                <div>
                  <small>DASHBOARD APPEARANCE</small>
                  <h3>Choose how ICA Unified feels.</h3>
                </div>
                <button type="button" onClick={() => setAppearanceOpen(false)}>×</button>
              </div>

              <div className="appearance-choice-grid">
                <button
                  type="button"
                  className={appearance === 'COMMAND' ? 'selected' : ''}
                  disabled={appearanceBusy}
                  onClick={() => updateAppearance('user', 'COMMAND')}
                >
                  <strong>Command</strong>
                  <span>Live operational color, status indicators, charts, and command-center energy.</span>
                </button>
                <button
                  type="button"
                  className={appearance === 'EXECUTIVE' ? 'selected' : ''}
                  disabled={appearanceBusy}
                  onClick={() => updateAppearance('user', 'EXECUTIVE')}
                >
                  <strong>Executive</strong>
                  <span>Bold black, white, charcoal, and warm-neutral business presentation.</span>
                </button>
              </div>

              <button
                type="button"
                className="appearance-default"
                disabled={appearanceBusy || appearanceState.userOverride === null}
                onClick={() => updateAppearance('user', null)}
              >
                Use company default — {appearanceState.orgDefault === 'EXECUTIVE' ? 'Executive' : 'Command'}
              </button>

              {appearanceState.canManageOrganization && (
                <div className="appearance-company">
                  <small>ORGANIZATION DEFAULT</small>
                  <p>Owners and admins set the starting appearance for everyone in this company. Each user can still choose a personal view.</p>
                  <div>
                    <button
                      type="button"
                      disabled={appearanceBusy}
                      className={appearanceState.orgDefault === 'COMMAND' ? 'selected' : ''}
                      onClick={() => updateAppearance('organization', 'COMMAND')}
                    >
                      Command
                    </button>
                    <button
                      type="button"
                      disabled={appearanceBusy}
                      className={appearanceState.orgDefault === 'EXECUTIVE' ? 'selected' : ''}
                      onClick={() => updateAppearance('organization', 'EXECUTIVE')}
                    >
                      Executive
                    </button>
                  </div>
                </div>
              )}
            </aside>
          )}
        </header>

        <section className="dashboard-welcome">
          <div>
            <h1>Welcome back, {firstName}</h1>
            <p>Here&apos;s what&apos;s happening with {organizationName} today.</p>
          </div>
          <div className="dashboard-kpis">
            <button onClick={() => router.push('/workspace/people')}><b>{stats.members}</b><span>Total People</span><small>View all</small></button>
            <button onClick={() => router.push('/workspace/learning')}><b>{stats.courses}</b><span>Courses</span><small>View courses</small></button>
            <button onClick={() => router.push('/workspace/credentials')}><b>{stats.credentials}</b><span>Credentials</span><small>View all</small></button>
            <button onClick={() => router.push('/workspace/documents')}><b>{stats.documents}</b><span>Documents</span><small>View all</small></button>
          </div>
        </section>

        <section className="dashboard-grid-two">
          <article className="dashboard-card learning-overview">
            <div className="card-heading"><h2>Learning Overview</h2><button onClick={() => router.push('/workspace/learning')}>View all courses</button></div>
            <div className="learning-layout">
              <div className="donut-wrap">
                <div className="donut" style={{'--value': `${completion}%`} as React.CSSProperties}><span><b>{completion}%</b><small>Average<br/>Completion</small></span></div>
                <div className="legend-stack"><span><i className="dot blue"/> {stats.courses} <small>Active Courses</small></span><span><i className="dot green"/> {stats.credentials} <small>Credentials Earned</small></span><span><i className="dot amber"/> {Math.max(stats.courses - stats.credentials, 0)} <small>Needs Attention</small></span></div>
              </div>
              <div className="activity-list">
                <h3>Recent Activity</h3>
                <button onClick={() => router.push('/workspace/learning')}><i>✓</i><span><b>Learning engine ready</b><small>{stats.courses} courses available</small></span></button>
                <button onClick={() => router.push('/workspace/people')}><i>→</i><span><b>People workspace active</b><small>{stats.members} profiles connected</small></span></button>
                <button onClick={() => router.push('/workspace/documents')}><i>!</i><span><b>Document controls online</b><small>{stats.documents} controlled documents</small></span></button>
              </div>
            </div>
          </article>

          <article className="dashboard-card people-overview">
            <div className="card-heading"><h2>People Overview</h2><button onClick={() => router.push('/workspace/people')}>View all people</button></div>
            <div className="people-overview-content">
              <div className="people-donut"><span><b>{stats.members}</b><small>Total People</small></span></div>
              <div className="people-role-list">
                <span><i className="dot purple"/> Owners <b>{role === 'OWNER' ? 1 : 0}</b></span>
                <span><i className="dot blue"/> Managers <b>{role === 'MANAGER' ? 1 : 0}</b></span>
                <span><i className="dot cyan"/> Admins <b>{role === 'ADMIN' ? 1 : 0}</b></span>
                <span><i className="dot green"/> Members <b>{Math.max(stats.members - 1, 0)}</b></span>
              </div>
            </div>
            <div className="people-footer"><button onClick={() => router.push('/workspace/people')}>+ Quick Invite</button><button onClick={() => router.push('/workspace/people')}>View onboarding</button><button onClick={() => router.push('/workspace/people')}>Manage people</button></div>
          </article>
        </section>

        <section className="dashboard-grid-three">
          <article className="dashboard-card mini-card">
            <div className="card-heading"><h2>Credential Status</h2><button onClick={() => router.push('/workspace/credentials')}>View all credentials</button></div>
            <div className="triple-metric"><span><b>{stats.credentials}</b><small>Active</small></span><span><b>{Math.min(stats.credentials, 3)}</b><small>Expiring Soon</small></span><span><b>0</b><small>Expired</small></span></div>
            <div className="mini-list"><span>Credential records <b>{stats.credentials}</b></span><span>Verification system <b>Active</b></span><span>Public verification <b>Ready</b></span></div>
          </article>

          <article className="dashboard-card mini-card">
            <div className="card-heading"><h2>Document Compliance</h2><button onClick={() => router.push('/workspace/documents')}>View all documents</button></div>
            <div className="compliance-score"><b>{compliant}%</b><span>Overall Compliance</span><div><i style={{width:`${compliant}%`}}/></div></div>
            <div className="mini-list"><span>Controlled documents <b>{stats.documents}</b></span><span>Acknowledgment tracking <b>On</b></span><span>Tenant isolation <b>Active</b></span></div>
          </article>

          <article className="dashboard-card mini-card">
            <div className="card-heading"><h2>Reports Snapshot</h2><button onClick={() => router.push('/workspace/reports')}>View all reports</button></div>
            <div className="report-list">
              <button onClick={() => router.push('/workspace/reports')}><i>▣</i><span><b>Training Completion</b><small>See organization progress</small></span><strong>{stats.courses}</strong></button>
              <button onClick={() => router.push('/workspace/reports')}><i>◈</i><span><b>Credential Watch</b><small>Expiring credentials</small></span><strong>{Math.min(stats.credentials, 3)}</strong></button>
              <button onClick={() => router.push('/workspace/reports')}><i>▤</i><span><b>Document Compliance</b><small>Acknowledgment status</small></span><strong>{stats.documents}</strong></button>
            </div>
          </article>
        </section>

        <section className="dashboard-actionbar">
          <button onClick={() => router.push('/workspace/people')}><i>♙+</i><span>Quick Invite</span></button>
          <button onClick={() => router.push('/workspace/learning')}><i>▥</i><span>Create Course</span></button>
          <button onClick={() => router.push('/workspace/documents')}><i>▤</i><span>Upload Document</span></button>
          <button onClick={() => router.push('/workspace/reports')}><i>▥</i><span>Create Report</span></button>
          <div className="system-status"><small>SYSTEM STATUS</small><strong>● All Systems Operational</strong></div>
        </section>
      </section>
    </main>
  );
}
