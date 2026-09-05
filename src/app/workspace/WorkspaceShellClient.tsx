'use client';

import { useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import ICAAssist from './ICAAssist';

type Props = {
  children: React.ReactNode;
  role: string;
  platformRole: string | null;
};

export default function WorkspaceShellClient({ children, role, platformRole }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const [tourStep, setTourStep] = useState<number | null>(null);

  const items = useMemo(() => {
    const base = [
      { label: 'Dashboard', path: '/workspace' },
      { label: 'Learning', path: '/workspace/learning' },
      { label: 'People', path: '/workspace/people' },
      { label: 'Credentials', path: '/workspace/credentials' },
      { label: 'Documents', path: '/workspace/documents' },
      { label: 'Reports', path: '/workspace/reports' },
      { label: 'Workflows', path: '/workspace/workflows' },
    ];
    if (role === 'OWNER' || role === 'ADMIN') base.push({ label: 'Tools', path: '/workspace/tools' });
    return base;
  }, [role]);

  const tips = useMemo(() => {
    const steps = [
      {
        title: 'Dashboard',
        body: 'Your organization overview lives here. It shows people, learning, credentials, documents, and association workflow activity.',
      },
      {
        title: 'Workflows',
        body: 'Create memberships, registrations, events, webinars, prices, CEU rules, certificates, and confirmation details from one workflow instead of jumping between modules.',
      },
      {
        title: 'Learning + Credentials',
        body: 'Learning manages education and progress. Credentials keeps certificates and verification records tied to the same member record.',
      },
      {
        title: 'People + Tools',
        body: role === 'OWNER' || role === 'ADMIN'
          ? 'People manages member records. Tools handles imports, migrations, website connections, APIs, and organization setup.'
          : 'People is where member records live. Organization setup tools are available to owners and admins.',
      },
    ];
    if (platformRole) {
      steps.push({
        title: platformRole === 'SUPER_ADMIN' ? 'Super Admin' : 'Platform Control',
        body: 'Your platform controls are separate from company operations and are used for diagnostics, support, health, and platform administration.',
      });
    }
    return steps;
  }, [role, platformRole]);

  useEffect(() => {
    const seen = window.sessionStorage.getItem('ica_workspace_tour_seen');
    if (!seen) setTourStep(0);
  }, []);

  function closeTour() {
    window.sessionStorage.setItem('ica_workspace_tour_seen', '1');
    setTourStep(null);
  }

  function nextTip() {
    if (tourStep === null) return;
    if (tourStep >= tips.length - 1) return closeTour();
    setTourStep(tourStep + 1);
  }

  return (
    <>
      <div className="workspace-mobile-dock" aria-label="ICA Unified navigation">
        <div className="workspace-mobile-brand">
          <strong>ICA UNIFIED</strong>
          <button onClick={() => setTourStep(0)}>?</button>
        </div>
        <nav>
          {items.map((item) => {
            const active = item.path === '/workspace'
              ? pathname === '/workspace'
              : pathname.startsWith(item.path);
            return (
              <button
                key={item.path}
                className={active ? 'active' : ''}
                onClick={() => router.push(item.path)}
              >
                {item.label}
              </button>
            );
          })}
          {platformRole && (
            <button className="platform" onClick={() => router.push('/platform')}>
              {platformRole === 'SUPER_ADMIN' ? 'Super Admin' : 'Platform'}
            </button>
          )}
        </nav>
      </div>

      {children}

      <ICAAssist />

      {tourStep !== null && tips[tourStep] && (
        <div className="workspace-tour-overlay" role="dialog" aria-modal="true">
          <div className="workspace-tour-card">
            <small>ICA QUICK TOUR · {tourStep + 1} / {tips.length}</small>
            <h2>{tips[tourStep].title}</h2>
            <p>{tips[tourStep].body}</p>
            <div>
              <button className="skip" onClick={closeTour}>Skip</button>
              <button className="next" onClick={nextTip}>
                {tourStep === tips.length - 1 ? 'Got it' : 'Next →'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
