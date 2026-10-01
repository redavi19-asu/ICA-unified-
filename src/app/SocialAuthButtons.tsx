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
    <div className="director-social-auth">
      <span>CONTINUE WITH</span>
      <div>
        {providers.google && <button type="button" onClick={() => start('google')}><span aria-hidden="true" style={{width:24,height:24,borderRadius:"50%",background:"#fff",display:"inline-grid",placeItems:"center",marginRight:7,boxShadow:"0 1px 3px rgba(0,0,0,.18)"}}><span style={{fontWeight:900,fontSize:17,lineHeight:1,background:"linear-gradient(135deg,#4285F4 0 25%,#34A853 25% 50%,#FBBC05 50% 75%,#EA4335 75% 100%)",WebkitBackgroundClip:"text",backgroundClip:"text",color:"transparent"}}>G</span></span>Google</button>}
        {providers.apple && <button type="button" onClick={() => start('apple')}>Apple</button>}
        {providers.microsoft && <button type="button" onClick={() => start('microsoft')}>Microsoft</button>}
      </div>
      <small>{purpose === 'register'
        ? 'A verified provider account can create your ICA Software account without another password.'
        : 'Use the provider already linked to your ICA Software email.'}</small>
    </div>
  );
}
