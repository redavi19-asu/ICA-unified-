'use client';

import { useEffect, useState } from 'react';

type ProviderState = { google?: boolean; apple?: boolean; microsoft?: boolean };

export default function SocialAuthButtons({
  purpose,
  organizationSlug = '',
}: {
  purpose: 'login' | 'register';
  organizationSlug?: string;
}) {
  const [providers, setProviders] = useState<ProviderState>({});

  useEffect(() => {
    fetch('/api/auth/social/status', { cache: 'no-store' })
      .then((response) => response.ok ? response.json() : { providers: {} })
      .then((data) => setProviders(data.providers || {}))
      .catch(() => setProviders({}));
  }, []);

  if (!Object.values(providers).some(Boolean)) return null;

  function start(provider: keyof ProviderState) {
    const url = new URL('/api/auth/social/' + provider + '/start', window.location.origin);
    url.searchParams.set('purpose', purpose);
    if (purpose === 'login' && organizationSlug.trim()) {
      url.searchParams.set('organizationSlug', organizationSlug.trim());
    }
    window.location.assign(url.toString());
  }

  return (
    <div style={{ display: 'grid', gap: 9, margin: '0 0 18px' }}>
      <span style={{ fontSize: 10, fontWeight: 900, letterSpacing: '.12em', opacity: .62 }}>
        {purpose === 'register' ? 'VERIFY WITH' : 'CONTINUE WITH'}
      </span>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 8 }}>
        {providers.google && <button type="button" onClick={() => start('google')}><span aria-hidden="true" style={{fontWeight:900,marginRight:7,color:"#fff"}}>G</span>Google</button>}
        {providers.apple && <button type="button" onClick={() => start('apple')}>Apple</button>}
        {providers.microsoft && <button type="button" onClick={() => start('microsoft')}>Microsoft</button>}
      </div>
      <small style={{ opacity: .62, lineHeight: 1.45 }}>
        Social identity verifies your account. Company access, billing, roles, and ICA permissions stay separate.
      </small>
    </div>
  );
}
