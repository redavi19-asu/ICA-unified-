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
        {providers.apple && <button type="button" onClick={() => start('apple')}><span aria-hidden="true" style={{width:24,height:24,display:"inline-grid",placeItems:"center",marginRight:7}}><svg viewBox="0 0 24 24" width="19" height="19" role="presentation" style={{display:"block"}}><path fill="currentColor" d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.519-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.636-.026 2.676-1.48 3.675-2.948 1.169-1.701 1.649-3.35 1.675-3.441-.039-.013-3.182-1.221-3.221-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.117-4.61 1.117zm3.312-3.09C16.3 2.8 16.85 1.4 16.72 0c-1.195.052-2.636.806-3.48 1.792-.754.871-1.415 2.299-1.26 3.675 1.325.104 2.676-.675 3.48-1.662z"/></svg></span>Apple</button>}
        {providers.microsoft && <button type="button" onClick={() => start('microsoft')}><span aria-hidden="true" style={{width:24,height:24,display:"inline-grid",placeItems:"center",marginRight:7}}><svg viewBox="0 0 24 24" width="18" height="18" role="presentation" style={{display:"block"}}><path fill="#f25022" d="M2 2h9v9H2z"/><path fill="#7fba00" d="M13 2h9v9h-9z"/><path fill="#00a4ef" d="M2 13h9v9H2z"/><path fill="#ffb900" d="M13 13h9v9h-9z"/></svg></span>Microsoft</button>}
      </div>
      <small>{purpose === 'register'
        ? 'A verified provider account can create your ICA Software account without another password.'
        : 'Use the provider already linked to your ICA Software email.'}</small>
    </div>
  );
}
