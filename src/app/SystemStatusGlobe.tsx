'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import styles from './landing.module.css';

type HealthState = 'checking' | 'connected' | 'issue';

function NodeIcon({ type }: { type: string }) {
  const common = { width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  if (type === 'people') return <svg {...common}><circle cx="9" cy="8" r="3"/><path d="M3.5 19c.8-3.1 2.6-4.7 5.5-4.7s4.7 1.6 5.5 4.7"/><circle cx="17" cy="9" r="2.3"/><path d="M15.5 14.7c2.8-.3 4.6 1.1 5.2 4.3"/></svg>;
  if (type === 'learning') return <svg {...common}><path d="M3 6.5 12 3l9 3.5-9 3.5-9-3.5Z"/><path d="M6 9v5.2c2.5 2.4 9.5 2.4 12 0V9"/></svg>;
  if (type === 'credential') return <svg {...common}><circle cx="12" cy="8" r="4"/><path d="m9.4 12-1 8 3.6-2 3.6 2-1-8"/></svg>;
  if (type === 'document') return <svg {...common}><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v5h5"/></svg>;
  if (type === 'compliance') return <svg {...common}><path d="M12 3 4.5 6v5c0 5 3 8.2 7.5 10 4.5-1.8 7.5-5 7.5-10V6z"/><path d="m8.5 12 2.1 2.1 4.9-5"/></svg>;
  return <svg {...common}><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>;
}


function RealMapGlobe({ health }: { health: HealthState }) {
  const frameRef = useRef<HTMLIFrameElement | null>(null);

  const srcDoc = useMemo(() => `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no" />
<link href="https://unpkg.com/maplibre-gl@6.9.1/dist/maplibre-gl.css" rel="stylesheet" />
<style>
html,body,#map{margin:0;width:100%;height:100%;overflow:hidden;background:transparent}
body{background:transparent}
.maplibregl-map,.maplibregl-canvas-container,.maplibregl-canvas{width:100%!important;height:100%!important}
.maplibregl-control-container{display:none!important}
</style>
</head>
<body>
<div id="map"></div>
<script src="https://unpkg.com/maplibre-gl@6.9.1/dist/maplibre-gl.js"></script>
<script>
(() => {
  let health = 'checking';
  let userInteracting = false;
  let resumeTimer = null;
  let raf = 0;
  let last = performance.now();

  const map = new maplibregl.Map({
    container: 'map',
    style: 'https://demotiles.maplibre.org/style.json',
    center: [0, 12],
    zoom: 1.05,
    minZoom: 0.7,
    maxZoom: 5.5,
    pitch: 0,
    bearing: 0,
    attributionControl: false,
    canvasContextAttributes: { antialias: true }
  });

  const pause = () => {
    userInteracting = true;
    if (resumeTimer) clearTimeout(resumeTimer);
  };

  const resumeSoon = () => {
    if (resumeTimer) clearTimeout(resumeTimer);
    resumeTimer = setTimeout(() => { userInteracting = false; }, 3200);
  };

  map.on('style.load', () => {
    map.setProjection({ type: 'globe' });

    const animate = (now) => {
      const delta = Math.min(34, now - last);
      last = now;

      if (health !== 'issue' && !userInteracting && map.getZoom() < 2.4) {
        const center = map.getCenter();
        map.jumpTo({ center: [center.lng - delta * 0.0065, center.lat] });
      }

      raf = requestAnimationFrame(animate);
    };

    cancelAnimationFrame(raf);
    last = performance.now();
    raf = requestAnimationFrame(animate);
  });

  map.on('load', () => {
    parent.postMessage({ type: 'ica-maplibre-ready' }, '*');
  });

  map.on('error', (event) => {
    parent.postMessage({
      type: 'ica-maplibre-error',
      message: event && event.error ? String(event.error.message || event.error) : 'Unknown MapLibre error'
    }, '*');
  });

  const canvas = map.getCanvasContainer();
  ['mousedown','touchstart','wheel'].forEach((name) => canvas.addEventListener(name, pause, { passive: true }));
  map.on('moveend', resumeSoon);
  map.on('zoomend', resumeSoon);

  addEventListener('message', (event) => {
    if (!event.data || event.data.type !== 'ica-health') return;
    health = event.data.health;
  });
})();
</script>
</body>
</html>`, []);

  useEffect(() => {
    frameRef.current?.contentWindow?.postMessage({ type: 'ica-health', health }, '*');
  }, [health]);

  return (
    <div className={`${styles.realGlobeShell} ${health === 'issue' ? styles.realGlobeIssue : ''}`}>
      <iframe
        ref={frameRef}
        className={styles.realGlobeFrame}
        title="Interactive ICA Unified MapLibre world globe"
        srcDoc={srcDoc}
        scrolling="no"
        sandbox="allow-scripts allow-same-origin"
        onLoad={() => {
          frameRef.current?.contentWindow?.postMessage({ type: 'ica-health', health }, '*');
        }}
      />
      <div className={styles.globeHint}>{health === 'issue' ? 'SERVICE ISSUE · AUTO-SPIN PAUSED' : 'DRAG · ZOOM · AUTO-SPIN'}</div>
    </div>
  );
}

export default function SystemStatusGlobe() {
  const [status, setStatus] = useState<HealthState>('checking');

  useEffect(() => {
    let mounted = true;
    const timer = setInterval(checkHealth, 60000);

    async function checkHealth() {
      try {
        const response = await fetch('/api/health', {
          method: 'GET',
          cache: 'no-store',
          headers: { Accept: 'application/json' },
        });

        const data = await response.json().catch(() => null);
        const connected =
          response.ok &&
          data?.ok === true &&
          data?.databaseReady === true &&
          data?.centralDatabaseReady === true;

        if (mounted) setStatus(connected ? 'connected' : 'issue');
      } catch {
        if (mounted) setStatus('issue');
      }
    }

    checkHealth();

    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, []);

  const label =
    status === 'connected'
      ? 'CONNECTED'
      : status === 'checking'
        ? 'CHECKING'
        : 'SERVICE ISSUE';

  return (
    <div className={styles.systemCard} aria-label="ICA Unified live system map">
      <div className={styles.systemTop}>
        <span>ICA UNIFIED</span>
        <span
          className={`${styles.liveStatus} ${styles[status]}`}
          aria-live="polite"
          title="Live Worker and database health"
        >
          <b aria-hidden="true" />
          {label}
        </span>
      </div>

      <div className={styles.globeStage}>
        <RealMapGlobe health={status} />

        <div className={styles.coreLabel}>
          <small>ONE SHARED PLATFORM</small>
          <strong>AMS + LMS</strong>
          <span>BUSINESS DATA CORE</span>
        </div>
      </div>

      <div className={styles.nodes}>
        <span><i><NodeIcon type="people" /></i>PEOPLE</span>
        <span><i><NodeIcon type="learning" /></i>LEARNING</span>
        <span><i><NodeIcon type="credential" /></i>CREDENTIALS</span>
        <span><i><NodeIcon type="document" /></i>DOCUMENTS</span>
        <span><i><NodeIcon type="compliance" /></i>COMPLIANCE</span>
        <span><i><NodeIcon type="report" /></i>REPORTING</span>
      </div>

      <div className={styles.systemBottom}>
        <strong>WEBSITE ↔ API ↔ ICA UNIFIED ↔ ORGANIZATION WORKSPACE</strong>
        <small className={styles.mapCredit}>MapLibre rendering · Map data: Natural Earth</small>
      </div>
    </div>
  );
}