'use client';

import { useEffect, useRef, useState } from 'react';
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
  const mapRef = useRef<HTMLDivElement | null>(null);
  const healthRef = useRef<HealthState>(health);
  const mapInstanceRef = useRef<import('maplibre-gl').Map | null>(null);

  useEffect(() => {
    healthRef.current = health;
  }, [health]);

  useEffect(() => {
    let disposed = false;
    let frame = 0;
    let resumeTimer: number | undefined;

    async function initMap() {
      if (!mapRef.current || mapInstanceRef.current || disposed) return;

      const maplibregl = await import('maplibre-gl');
      if (!mapRef.current || disposed) return;

      const style = {
        version: 8 as const,
        sources: {
          basemap: {
            type: 'raster' as const,
            tiles: [
              'https://tile-a.openstreetmap.fr/hot/{z}/{x}/{y}.png',
              'https://tile-b.openstreetmap.fr/hot/{z}/{x}/{y}.png',
              'https://tile-c.openstreetmap.fr/hot/{z}/{x}/{y}.png',
            ],
            tileSize: 256,
            minzoom: 0,
            maxzoom: 20,
            attribution: 'Humanitarian style © HOT · Tiles hosted by OpenStreetMap France · Map data © OpenStreetMap contributors',
          },
        },
        layers: [
          {
            id: 'basemap',
            type: 'raster' as const,
            source: 'basemap',
            paint: {
              'raster-saturation': 0.22,
              'raster-contrast': 0.1,
              'raster-brightness-min': 0.03,
              'raster-brightness-max': 1,
            },
          },
        ],
      };

      const map = new maplibregl.Map({
        container: mapRef.current,
        style,
        center: [-18, 22],
        zoom: 1.12,
        minZoom: 0.8,
        maxZoom: 5.5,
        pitch: 0,
        bearing: 0,
        attributionControl: false,
        canvasContextAttributes: { antialias: true },
      });

      mapInstanceRef.current = map;

      let userInteracting = false;
      let lastFrame = performance.now();

      const pauseSpin = () => {
        userInteracting = true;
        if (resumeTimer) window.clearTimeout(resumeTimer);
      };

      const resumeSpinSoon = () => {
        if (resumeTimer) window.clearTimeout(resumeTimer);
        resumeTimer = window.setTimeout(() => {
          userInteracting = false;
        }, 3200);
      };

      let spinStarted = false;

      map.on('load', () => {
        if (disposed) return;

        map.setProjection({ type: 'globe' });

        if (spinStarted) return;
        spinStarted = true;
        lastFrame = performance.now();

        const animate = (now: number) => {
          if (disposed || !mapInstanceRef.current) return;

          const delta = Math.min(34, now - lastFrame);
          lastFrame = now;

          if (healthRef.current !== 'issue' && !userInteracting && map.getZoom() < 2.4) {
            const center = map.getCenter();
            map.jumpTo({ center: [center.lng - delta * 0.0065, center.lat] });
          }

          frame = requestAnimationFrame(animate);
        };

        frame = requestAnimationFrame(animate);
      });

      map.on('error', (event) => {
        console.error('ICA_MAPLIBRE_GLOBE_ERROR', event.error);
      });

      const canvas = map.getCanvasContainer();
      ['mousedown', 'touchstart', 'wheel'].forEach((eventName) => {
        canvas.addEventListener(eventName, pauseSpin, { passive: true });
      });

      map.on('moveend', resumeSpinSoon);
      map.on('zoomend', resumeSpinSoon);
    }

    void initMap();

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      if (resumeTimer) window.clearTimeout(resumeTimer);
      mapInstanceRef.current?.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  return (
    <div className={`${styles.realGlobeShell} ${health === 'issue' ? styles.realGlobeIssue : ''}`}>
      <div
        ref={mapRef}
        className={styles.realGlobeMap}
        aria-label="Interactive ICA Unified MapLibre world globe"
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
        <small className={styles.mapCredit}>MapLibre globe · Humanitarian OpenStreetMap style · Tiles via OpenStreetMap France</small>
      </div>
    </div>
  );
}