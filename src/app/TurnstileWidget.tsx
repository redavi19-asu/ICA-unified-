'use client';

import Script from 'next/script';
import { useCallback, useEffect, useRef, useState } from 'react';

declare global {
  interface Window {
    turnstile?: {
      render: (element: HTMLElement, options: {
        sitekey: string;
        callback: (token: string) => void;
        'expired-callback'?: () => void;
        'error-callback'?: () => void;
        theme?: 'light' | 'dark' | 'auto';
        size?: 'normal' | 'compact';
      }) => string;
      remove: (widgetId: string) => void;
    };
  }
}

type Props = {
  onToken: (token: string) => void;
  resetKey?: number;
  theme?: 'light' | 'dark' | 'auto';
};

const SITE_KEY = '0x4AAAAAAEpl_r2LJcL18Dn5';

export default function TurnstileWidget({ onToken, resetKey = 0, theme = 'dark' }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  const renderWidget = useCallback(() => {
    if (!containerRef.current || !window.turnstile) return;

    if (widgetIdRef.current) {
      try { window.turnstile.remove(widgetIdRef.current); } catch {}
      widgetIdRef.current = null;
    }

    containerRef.current.innerHTML = '';
    onToken('');
    setStatus('ready');

    try {
      widgetIdRef.current = window.turnstile.render(containerRef.current, {
        sitekey: SITE_KEY,
        callback: (token) => onToken(token),
        'expired-callback': () => onToken(''),
        'error-callback': () => {
          onToken('');
          setStatus('error');
        },
        theme,
        size: 'normal',
      });
    } catch {
      setStatus('error');
    }
  }, [onToken, theme]);

  useEffect(() => {
    if (window.turnstile) renderWidget();

    return () => {
      if (widgetIdRef.current && window.turnstile) {
        try { window.turnstile.remove(widgetIdRef.current); } catch {}
        widgetIdRef.current = null;
      }
    };
  }, [renderWidget, resetKey]);

  return (
    <div style={{width:'100%',margin:'4px 0 2px'}}>
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        strategy="afterInteractive"
        onReady={renderWidget}
        onError={() => setStatus('error')}
      />
      <div ref={containerRef} style={{minHeight:65,width:'100%'}} aria-label="Cloudflare Turnstile security verification" />
      {status === 'loading' && <p style={{fontSize:10,opacity:.6,margin:'4px 0'}}>Loading security verification…</p>}
      {status === 'error' && <p role="alert" style={{fontSize:11,color:'#e58f8f',margin:'4px 0'}}>Security verification could not load. Refresh and try again.</p>}
    </div>
  );
}
