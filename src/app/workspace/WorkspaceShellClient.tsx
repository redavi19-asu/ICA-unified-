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
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  const items = useMemo(() => {
    if (role === 'MEMBER') {
      return [
        { label: 'My Workspace', path: '/my' },
        { label: 'Learning', path: '/workspace/learning' },
        { label: 'CE Wallet', path: '/my/wallet' },
      ];
    }

    const base = [
      { label: 'Dashboard', path: '/workspace' },
      { label: 'Learning', path: '/workspace/learning' },
      { label: 'People', path: '/workspace/people' },
      { label: 'Credentials', path: '/workspace/credentials' },
      { label: 'Compliance', path: '/workspace/compliance' },
      { label: 'Documents', path: '/workspace/documents' },
      { label: 'Reports', path: '/workspace/reports' },
      { label: 'Workflows', path: '/workspace/workflows' },
    ];
    if (role === 'OWNER' || role === 'ADMIN') {
      base.push({ label: 'Integrations', path: '/workspace/integrations' });
      base.push({ label: 'Billing', path: '/workspace/billing' });
      base.push({ label: 'Tools', path: '/workspace/tools' });
    }
    return base;
  }, [role]);

  const tips = useMemo(() => {
    const steps = role === 'MEMBER'
      ? [
          {
            title: 'My Workspace',
            body: 'Your personal workspace keeps assigned training, credentials, required document acknowledgments, and items needing attention in one place.',
          },
          {
            title: 'Learning',
            body: 'Open assigned courses, complete lessons and quizzes, and keep your progress tied to the same ICA member record.',
          },
          {
            title: 'Credential + CE Wallet',
            body: 'Your wallet combines credentials, CE credits, renewal requirements, transcript history, and recommended courses.',
          },
        ]
      : [
          {
            title: 'Dashboard',
            body: 'Your organization overview lives here. It shows people, learning, credentials, documents, and association workflow activity.',
          },
          {
            title: 'Workflows',
            body: 'Configure membership programs and event/webinar operations, including pricing fields, CE rules, certificates, check-in direction, and confirmations.',
          },
          {
            title: 'Learning + Credentials',
            body: 'Learning manages education and progress. Credentials keeps certificates and verification records tied to the same member record.',
          },
          {
            title: 'Compliance',
            body: 'Compliance connects LMS course credits, AMS event attendance, CE requirements, renewal readiness, QR check-ins, and the member credential wallet through one credit ledger.',
          },
          {
            title: 'People + Tools',
            body: role === 'OWNER' || role === 'ADMIN'
              ? 'People manages member records. Integrations handles API keys, webhooks, domains, email staging, and exports. Billing manages the company subscription. Tools handles data migration and organization setup.'
              : 'People gives managers a read-only organization view. Owner/admin-only setup controls stay hidden.',
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

    const savedTheme = window.localStorage.getItem('ica_workspace_theme');
    if (savedTheme === 'dark' || savedTheme === 'light') setTheme(savedTheme);

    const onThemeChange = (event: Event) => {
      const next = (event as CustomEvent<'light' | 'dark'>).detail;
      if (next === 'light' || next === 'dark') setTheme(next);
    };
    window.addEventListener('ica-workspace-theme', onThemeChange);
    return () => window.removeEventListener('ica-workspace-theme', onThemeChange);
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
    <div className={`workspace-theme-root workspace-theme-${theme}`}>
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
    </div>
  );
}
