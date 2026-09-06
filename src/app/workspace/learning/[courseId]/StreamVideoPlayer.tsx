'use client';

import { useEffect, useState } from 'react';
import styles from '../learning.module.css';

export default function StreamVideoPlayer({ lessonId, title }: { lessonId: string; title: string }) {
  const [state, setState] = useState<'loading' | 'ready' | 'processing' | 'disabled' | 'error'>('loading');
  const [playerUrl, setPlayerUrl] = useState<string | null>(null);
  const [message, setMessage] = useState('Checking Cloudflare Stream...');

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const response = await fetch(`/api/stream/video?lessonId=${encodeURIComponent(lessonId)}`, { cache: 'no-store' });
        const data = await response.json();
        if (cancelled) return;

        if (!response.ok) {
          setState(data.code === 'STREAM_NOT_ENABLED' ? 'disabled' : 'error');
          setMessage(data.error || 'Stream video is unavailable.');
          return;
        }

        if (data.readyToStream && data.playerUrl) {
          setPlayerUrl(data.playerUrl);
          setState('ready');
          return;
        }

        setState('processing');
        setMessage(`Cloudflare is processing this video${data.state ? ` · ${String(data.state).replaceAll('_', ' ')}` : ''}.`);
      } catch {
        if (!cancelled) {
          setState('error');
          setMessage('Unable to check Stream video status.');
        }
      }
    }

    load();
    return () => { cancelled = true; };
  }, [lessonId]);

  if (state === 'ready' && playerUrl) {
    return (
      <div className={styles.mediaFrame}>
        <iframe
          src={playerUrl}
          title={title}
          allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
    );
  }

  return (
    <div className={styles.liveSession} data-state={state}>
      <span>CLOUDFLARE STREAM</span>
      <strong>{state === 'disabled' ? 'VIDEO HOSTING READY TO ACTIVATE' : state === 'processing' ? 'VIDEO PROCESSING' : 'VIDEO STATUS'}</strong>
      <p>{message}</p>
      {state === 'processing' && <button type="button" className={styles.secondary} onClick={() => window.location.reload()}>CHECK AGAIN</button>}
    </div>
  );
}
