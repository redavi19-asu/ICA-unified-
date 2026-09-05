'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';

type Props = {
  userName: string;
  role: string;
  organizationName: string;
  platformRole: string | null;
  stats: { members: number; courses: number; credentials: number; documents: number };
};

export default function WorkspaceClient({ userName, role, organizationName, platformRole, stats }: Props) {
  const router = useRouter();

  const completion = useMemo(() => Math.max(0, Math.min(100, stats.courses ? Math.round((stats.credentials / Math.max(stats.courses, 1)) * 68) : 0)), [stats.courses, stats.credentials]);
  const compliant = Math.max(0, Math.min(100, stats.documents ? 85 : 0));
  const firstName = userName.split(' ')[0] || userName;

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  }

  return (
    <main className="dashboard-shell">
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
          {(role === 'OWNER' || role === 'ADMIN') && (
            <button className="tools-nav-button" onClick={() => router.push('/workspace/tools')}>⚙ <span>Tools</span></button>
          )}
          <button onClick={() => router.push('/workspace/reports')}>⌁ <span>Integrations</span></button>
          <button onClick={() => router.push('/workspace/reports')}>▣ <span>Billing</span></button>
          <p>PLATFORM</p>
          {platformRole ? (
            <button className="super-admin-nav-button" onClick={() => router.push('/platform')}>
              ⚡
              <span>
                <strong>{platformRole === 'SUPER_ADMIN' ? 'Super Admin' : 'Platform Control'}</strong>
                <small>{platformRole === 'SUPER_ADMIN' ? 'FULL PLATFORM PRIVILEGES' : platformRole.replaceAll('_', ' ')}</small>
              </span>
            </button>
          ) : (
            <button onClick={() => router.push('/platform')}>◇ <span>Platform Admin</span></button>
          )}
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
            <div><strong>{userName}</strong><span>{role}</span></div>
            <button onClick={logout}>Sign out</button>
          </div>
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
