'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

type Props = {
  userName: string;
  role: string;
  organizationName: string;
  platformRole: string | null;
  stats: {
    members: number;
    courses: number;
    credentials: number;
    documents: number;
    assignments: number;
    averageCompletion: number;
    overdueTraining: number;
    credentialActive: number;
    credentialExpiringSoon: number;
    credentialExpired: number;
    documentCompliance: number;
    pendingAcknowledgments: number;
    roleCounts: { owners: number; admins: number; managers: number; members: number };
  };
  workflowStats: {
    total: number;
    membershipPrograms: number;
    activeEvents: number;
    draftWorkflows: number;
    upcomingEvents: number;
    ceuConfiguredEvents: number;
  };
};

export default function WorkspaceClient({ userName, role, organizationName, platformRole, stats, workflowStats }: Props) {
  const router = useRouter();
  const firstName = userName.split(' ')[0] || userName;
  const canManagePeople = role === 'OWNER' || role === 'ADMIN';
  const [systemHealth, setSystemHealth] = useState<'checking' | 'connected' | 'issue'>('checking');

  useEffect(() => {
    let mounted = true;

    async function checkHealth() {
      try {
        const response = await fetch('/api/health', { cache: 'no-store' });
        const data = await response.json().catch(() => null);
        const connected = response.ok && data?.ok === true;
        if (mounted) setSystemHealth(connected ? 'connected' : 'issue');
      } catch {
        if (mounted) setSystemHealth('issue');
      }
    }

    void checkHealth();
    const timer = window.setInterval(checkHealth, 60000);
    return () => {
      mounted = false;
      window.clearInterval(timer);
    };
  }, []);


  async function logout() {
    try {
      const response = await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      });

      if (!response.ok) {
        throw new Error('Unable to sign out.');
      }

      window.location.replace('/login?loggedOut=1');
    } catch {
      window.location.assign('/login?logoutError=1');
    }
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
          <button onClick={() => router.push('/workspace/compliance')}>✓ <span>Compliance</span></button>
          <button onClick={() => router.push('/workspace/documents')}>▤ <span>Documents</span></button>
          <button onClick={() => router.push('/workspace/reports')}>▥ <span>Reports</span></button>
          <button className="workflow-nav-button" onClick={() => router.push('/workspace/workflows')}>↯ <span>Workflows</span></button>
          <p>COMPANY SETTINGS</p>
          {canManagePeople && <button onClick={() => router.push('/workspace/people')}>◈ <span>Roles & Permissions</span></button>}
          {(role === 'OWNER' || role === 'ADMIN') && (
            <>
              <button className="tools-nav-button" onClick={() => router.push('/workspace/tools')}>⚙ <span>Tools</span></button>
              <button onClick={() => router.push('/workspace/integrations')}>⌁ <span>Integrations</span></button>
              <button onClick={() => router.push('/workspace/billing')}>▣ <span>Billing</span></button>
            </>
          )}
          {platformRole && (
            <>
              <p>PLATFORM</p>
              <button className="super-admin-nav-button" onClick={() => router.push('/platform')}>
                ⚡
                <span>
                  <strong>{platformRole === 'SUPER_ADMIN' ? 'Super Admin' : 'Platform Control'}</strong>
                  <small>{platformRole === 'SUPER_ADMIN' ? 'FULL PLATFORM PRIVILEGES' : platformRole.replaceAll('_', ' ')}</small>
                </span>
              </button>
            </>
          )}
        </nav>

        <div className="dashboard-help">
          <strong>Need Help?</strong>
          <span>Need product or account help from I Computer Anything?</span>
          <button onClick={() => window.open('https://icomputeranything.com/#contact', '_blank', 'noopener,noreferrer')}>Contact Support</button>
        </div>
      </aside>

      <section className="dashboard-main">
        <header className="dashboard-topbar">
          <div className="company-switcher">
            <span>Company Workspace</span>
            <button type="button" disabled title="Current organization">{organizationName}</button>
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

        <section className="workflow-summary-panel">
          <div className="workflow-summary-head">
            <div>
              <small>ASSOCIATION OPERATIONS</small>
              <h2>Membership + Event Workflows</h2>
              <p>See what the organization has configured without digging through separate modules.</p>
            </div>
            <button onClick={() => router.push('/workspace/workflows')}>OPEN WORKFLOW STUDIO →</button>
          </div>
          <div className="workflow-summary-grid">
            <button onClick={() => router.push('/workspace/workflows')}><b>{workflowStats.membershipPrograms}</b><span>Membership Programs</span><small>Configured tiers & applications</small></button>
            <button onClick={() => router.push('/workspace/workflows')}><b>{workflowStats.activeEvents}</b><span>Active Events / Webinars</span><small>Active workflow configurations</small></button>
            <button onClick={() => router.push('/workspace/workflows')}><b>{workflowStats.upcomingEvents}</b><span>Upcoming Events</span><small>Future-dated workflows</small></button>
            <button onClick={() => router.push('/workspace/workflows')}><b>{workflowStats.draftWorkflows}</b><span>Draft Workflows</span><small>Not active yet</small></button>
            <button onClick={() => router.push('/workspace/workflows')}><b>{workflowStats.ceuConfiguredEvents}</b><span>CEU-Configured Events</span><small>Events with credit values</small></button>
            <button onClick={() => router.push('/workspace/workflows')}><b>{workflowStats.total}</b><span>Total Workflows</span><small>Membership + event workflows</small></button>
          </div>
        </section>

        <section className="dashboard-grid-two">
          <article className="dashboard-card learning-overview">
            <div className="card-heading"><h2>Learning Overview</h2><button onClick={() => router.push('/workspace/learning')}>View all courses</button></div>
            <div className="learning-layout">
              <div className="donut-wrap">
                <div className="donut" style={{'--value': `${stats.averageCompletion}%`} as React.CSSProperties}><span><b>{stats.averageCompletion}%</b><small>Average<br/>Completion</small></span></div>
                <div className="legend-stack"><span><i className="dot blue"/> {stats.courses} <small>Active Courses</small></span><span><i className="dot green"/> {stats.assignments} <small>Assignments</small></span><span><i className="dot amber"/> {stats.overdueTraining} <small>Needs Attention</small></span></div>
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
                <span><i className="dot purple"/> Owners <b>{stats.roleCounts.owners}</b></span>
                <span><i className="dot blue"/> Managers <b>{stats.roleCounts.managers}</b></span>
                <span><i className="dot cyan"/> Admins <b>{stats.roleCounts.admins}</b></span>
                <span><i className="dot green"/> Members <b>{stats.roleCounts.members}</b></span>
              </div>
            </div>
            <div className="people-footer">{canManagePeople && <button onClick={() => router.push('/workspace/people')}>+ Quick Invite</button>}<button onClick={() => router.push('/workspace/people')}>View onboarding</button><button onClick={() => router.push('/workspace/people')}>{canManagePeople ? 'Manage people' : 'View people'}</button></div>
          </article>
        </section>

        <section className="dashboard-grid-three">
          <article className="dashboard-card mini-card">
            <div className="card-heading"><h2>Credential Status</h2><button onClick={() => router.push('/workspace/credentials')}>View all credentials</button></div>
            <div className="triple-metric"><span><b>{stats.credentialActive}</b><small>Active</small></span><span><b>{stats.credentialExpiringSoon}</b><small>Expiring Soon</small></span><span><b>{stats.credentialExpired}</b><small>Expired</small></span></div>
            <div className="mini-list"><span>Credential records <b>{stats.credentials}</b></span><span>Verification system <b>Active</b></span><span>Public verification <b>Ready</b></span></div>
          </article>

          <article className="dashboard-card mini-card">
            <div className="card-heading"><h2>Document Compliance</h2><button onClick={() => router.push('/workspace/documents')}>View all documents</button></div>
            <div className="compliance-score"><b>{stats.documentCompliance}%</b><span>Overall Compliance</span><div><i style={{width:`${stats.documentCompliance}%`}}/></div></div>
            <div className="mini-list"><span>Controlled documents <b>{stats.documents}</b></span><span>Acknowledgments due <b>{stats.pendingAcknowledgments}</b></span><span>Tenant isolation <b>Active</b></span></div>
          </article>

          <article className="dashboard-card mini-card">
            <div className="card-heading"><h2>Reports Snapshot</h2><button onClick={() => router.push('/workspace/reports')}>View all reports</button></div>
            <div className="report-list">
              <button onClick={() => router.push('/workspace/reports')}><i>▣</i><span><b>Training Completion</b><small>Average assignment progress</small></span><strong>{stats.averageCompletion}%</strong></button>
              <button onClick={() => router.push('/workspace/reports')}><i>◈</i><span><b>Credential Watch</b><small>Expiring within 30 days</small></span><strong>{stats.credentialExpiringSoon}</strong></button>
              <button onClick={() => router.push('/workspace/reports')}><i>▤</i><span><b>Document Compliance</b><small>Acknowledgments due</small></span><strong>{stats.pendingAcknowledgments}</strong></button>
            </div>
          </article>
        </section>

        <section className="dashboard-actionbar">
          {canManagePeople ? <button onClick={() => router.push('/workspace/people')}><i>♙+</i><span>Quick Invite</span></button> : <button onClick={() => router.push('/workspace/people')}><i>♙</i><span>View People</span></button>}
          <button onClick={() => router.push('/workspace/learning')}><i>▥</i><span>Create Course</span></button>
          <button onClick={() => router.push('/workspace/documents')}><i>▤</i><span>Upload Document</span></button>
          <button onClick={() => router.push('/workspace/workflows')}><i>↯</i><span>New Workflow</span></button>
          <div className="system-status"><small>SYSTEM STATUS</small><strong>{systemHealth === 'connected' ? '● Core Systems Operational' : systemHealth === 'checking' ? '● Checking Systems' : '● Service Issue'}</strong></div>
        </section>
      </section>

    </main>
  );
}
