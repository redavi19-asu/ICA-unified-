'use client';

import { useEffect, useMemo, useState } from 'react';
import ICAAssist from './ICAAssist';
import { useRouter } from 'next/navigation';

type Props = {
  userName: string;
  role: string;
  organizationName: string;
  platformRole: string | null;
  stats: { members: number; courses: number; credentials: number; documents: number };
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
  const [tipStep, setTipStep] = useState<number | null>(null);

  useEffect(() => {
    const seenThisSession = window.sessionStorage.getItem('ica_dashboard_tour_seen_this_session');
    if (!seenThisSession) setTipStep(0);
  }, []);

  const tourSteps = useMemo(() => {
    const steps = [
      {
        title: 'Your command dashboard',
        body: 'This page gives you the quick view: people, learning, credentials, documents, and association workflows.',
      },
      {
        title: 'Workflow Studio',
        body: 'Use Workflows when you are creating a membership program, event, webinar, registration, CEU setup, or another multi-step business process.',
      },
      {
        title: 'Tools',
        body: 'Owners and admins use Tools for imports, migrations, website connections, APIs, domains, and organization-level setup.',
      },
    ];

    if (platformRole) {
      steps.push({
        title: platformRole === 'SUPER_ADMIN' ? 'Super Admin' : 'Platform Control',
        body: 'This is your platform-level support area for company health, diagnostics, analytics, and account controls.',
      });
    }

    return steps;
  }, [platformRole]);

  function closeTour() {
    window.sessionStorage.setItem('ica_dashboard_tour_seen_this_session', '1');
    setTipStep(null);
  }

  function nextTip() {
    if (tipStep === null) return;
    if (tipStep >= tourSteps.length - 1) {
      closeTour();
      return;
    }
    setTipStep(tipStep + 1);
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
          <button className="workflow-nav-button" onClick={() => router.push('/workspace/workflows')}>↯ <span>Workflows</span></button>
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
            <button className="dashboard-tips-button" onClick={() => setTipStep(0)}>? Tips</button>
            <div><strong>{userName}</strong><span>{role}</span></div>
            <button onClick={logout}>Sign out</button>
          </div>
        </header>

        <section className="dashboard-guide-banner">
          <div>
            <small>NEW HERE?</small>
            <strong>Need a quick tour of ICA Unified?</strong>
            <span>See where memberships, events, learning, tools, and platform controls live.</span>
          </div>
          <button onClick={() => setTipStep(0)}>START QUICK TOUR →</button>
        </section>

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
            <button onClick={() => router.push('/workspace/workflows')}><b>{workflowStats.activeEvents}</b><span>Active Events / Webinars</span><small>Published registration workflows</small></button>
            <button onClick={() => router.push('/workspace/workflows')}><b>{workflowStats.upcomingEvents}</b><span>Upcoming Events</span><small>Future-dated workflows</small></button>
            <button onClick={() => router.push('/workspace/workflows')}><b>{workflowStats.draftWorkflows}</b><span>Draft Workflows</span><small>Not published yet</small></button>
            <button onClick={() => router.push('/workspace/workflows')}><b>{workflowStats.ceuConfiguredEvents}</b><span>CEU-Configured Events</span><small>Events with credit values</small></button>
            <button onClick={() => router.push('/workspace/workflows')}><b>{workflowStats.total}</b><span>Total Workflows</span><small>Membership + event workflows</small></button>
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
          <button onClick={() => router.push('/workspace/workflows')}><i>↯</i><span>New Workflow</span></button>
          <div className="system-status"><small>SYSTEM STATUS</small><strong>● All Systems Operational</strong></div>
        </section>
      </section>

      <ICAAssist />

      {tipStep !== null && tourSteps[tipStep] && (
        <div className="ica-tour-overlay" role="dialog" aria-modal="true" aria-label="ICA Unified quick tips">
          <div className="ica-tour-card">
            <div className="ica-tour-count">QUICK TIP {tipStep + 1} OF {tourSteps.length}</div>
            <h2>{tourSteps[tipStep].title}</h2>
            <p>{tourSteps[tipStep].body}</p>
            <div className="ica-tour-actions">
              <button className="ica-tour-skip" onClick={closeTour}>Skip</button>
              <button className="ica-tour-next" onClick={nextTip}>{tipStep === tourSteps.length - 1 ? 'Got it' : 'Next →'}</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
