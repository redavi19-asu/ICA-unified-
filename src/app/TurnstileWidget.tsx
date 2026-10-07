'use client';

import Script from 'next/script';
import { useCallback, useEffect, useRef, useState } from 'react';

declare global {
  interface Window {
    turnstile?: {
      render: (element: HTMLElement, options: {
        sitekey: string;
        action?: string;
        callback: (token: string) => void;
        'expired-callback'?: () => void;
        'timeout-callback'?: () => void;
        'error-callback'?: (code?: string) => void;
        theme?: 'light' | 'dark' | 'auto';
        size?: 'normal' | 'compact' | 'flexible';
        appearance?: 'always' | 'execute' | 'interaction-only';
        retry?: 'auto' | 'never';
        'retry-interval'?: number;
        'refresh-expired'?: 'auto' | 'manual' | 'never';
        'refresh-timeout'?: 'auto' | 'manual' | 'never';
      }) => string;
      remove: (widgetId: string) => void;
      getResponse?: (widgetId?: string) => string;
    };
  }
}

type Props = {
  onToken: (token: string) => void;
  resetKey?: number;
  theme?: 'light' | 'dark' | 'auto';
  action?: string;
};

const SITE_KEY = (process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || '0x4AAAAAAEpl_r2LJcL18Dn5').trim();

export default function TurnstileWidget({ onToken, resetKey = 0, theme = 'dark', action = 'unified_auth' }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const responseTimerRef = useRef<number | null>(null);
  const onTokenRef = useRef(onToken);
  const lastTokenRef = useRef('');
  const [status, setStatus] = useState<'loading' | 'ready' | 'verified' | 'error'>('loading');

  useEffect(() => {
    onTokenRef.current = onToken;
  }, [onToken]);

  const publishToken = useCallback((value: string) => {
    const token = String(value || '');
    if (token === lastTokenRef.current) return Boolean(token);
    lastTokenRef.current = token;
    onTokenRef.current(token);
    return Boolean(token);
  }, []);

  const stopResponsePolling = useCallback(() => {
    if (responseTimerRef.current !== null) {
      window.clearInterval(responseTimerRef.current);
      responseTimerRef.current = null;
    }
  }, []);

  const recoverSolvedToken = useCallback(() => {
    let token = '';
    if (widgetIdRef.current && window.turnstile?.getResponse) {
      try {
        token = String(window.turnstile.getResponse(widgetIdRef.current) || '');
      } catch {}
    }

    if (!token) {
      const responseField =
        containerRef.current?.querySelector<HTMLInputElement>('input[name="cf-turnstile-response"]') ||
        containerRef.current?.closest('form')?.querySelector<HTMLInputElement>('input[name="cf-turnstile-response"]');
      token = String(responseField?.value || '');
    }

    if (!token) return false;
    setStatus('verified');
    publishToken(token);
    return true;
  }, [publishToken]);

  const renderWidget = useCallback(() => {
    if (!containerRef.current || !window.turnstile) return;

    stopResponsePolling();

    if (widgetIdRef.current) {
      try { window.turnstile.remove(widgetIdRef.current); } catch {}
      widgetIdRef.current = null;
    }

    containerRef.current.innerHTML = '';
    publishToken('');
    setStatus('ready');

    try {
      widgetIdRef.current = window.turnstile.render(containerRef.current, {
        sitekey: SITE_KEY,
        action,
        callback: (token) => {
          setStatus('verified');
          publishToken(token);
        },
        'expired-callback': () => {
          setStatus('ready');
          publishToken('');
        },
        'timeout-callback': () => {
          if (!recoverSolvedToken()) {
            publishToken('');
            setStatus('error');
          }
        },
        'error-callback': () => {
          if (!recoverSolvedToken()) {
            publishToken('');
            setStatus('error');
          }
        },
        theme,
        size: 'flexible',
        appearance: 'always',
        retry: 'auto',
        'retry-interval': 4000,
        'refresh-expired': 'auto',
        'refresh-timeout': 'auto',
      });

      recoverSolvedToken();
      responseTimerRef.current = window.setInterval(recoverSolvedToken, 250);
    } catch {
      publishToken('');
      setStatus('error');
    }
  }, [action, publishToken, recoverSolvedToken, stopResponsePolling, theme]);

  useEffect(() => {
    if (window.turnstile) renderWidget();

    return () => {
      stopResponsePolling();
      if (widgetIdRef.current && window.turnstile) {
        try { window.turnstile.remove(widgetIdRef.current); } catch {}
        widgetIdRef.current = null;
      }
      publishToken('');
    };
  }, [publishToken, renderWidget, resetKey, stopResponsePolling]);

  return (
    <div style={{width:'100%',margin:'4px 0 2px'}}>
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        strategy="afterInteractive"
        onReady={renderWidget}
        onError={() => {
          publishToken('');
          setStatus('error');
        }}
      />
      <div ref={containerRef} style={{minHeight:65,width:'100%'}} aria-label="Cloudflare Turnstile security verification" />
      {status === 'loading' && <p style={{fontSize:10,opacity:.6,margin:'4px 0'}}>Loading security verification…</p>}
      {status === 'error' && <p role="alert" style={{fontSize:11,color:'#e58f8f',margin:'4px 0'}}>Security verification could not finish. Retry the check or refresh this page.</p>}
    </div>
  );
}
