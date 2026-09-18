'use client';

import { useEffect, useRef, useState } from 'react';
import worldCountries from './world-countries.json';
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


type Position = [number, number];
type PolygonCoordinates = Position[][];
type MultiPolygonCoordinates = Position[][][];
type CountryGeometry =
  | { type: 'Polygon'; coordinates: PolygonCoordinates }
  | { type: 'MultiPolygon'; coordinates: MultiPolygonCoordinates };
type CountryFeature = {
  type: 'Feature';
  properties: { MAPCOLOR7?: number; NAME?: string };
  geometry: CountryGeometry;
};
type CountryCollection = {
  type: 'FeatureCollection';
  features: CountryFeature[];
};

const COUNTRY_COLORS = [
  '#d8c7ff',
  '#f4c56f',
  '#9edb84',
  '#f3df79',
  '#78d5a1',
  '#73c7f4',
  '#a9b8ff',
  '#f0a98b',
];

function RealMapGlobe({ health }: { health: HealthState }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const healthRef = useRef<HealthState>(health);
  const rotationRef = useRef(-20);
  const visibleRef = useRef(true);
  const pageVisibleRef = useRef(true);
  const reducedMotionRef = useRef(false);

  useEffect(() => {
    healthRef.current = health;
  }, [health]);

  useEffect(() => {
    const canvasResult = canvasRef.current;
    if (!canvasResult) return;
    const canvas: HTMLCanvasElement = canvasResult;

    const size = 320;
    const textureWidth = 1024;
    const textureHeight = 512;
    const radius = size / 2 - 3;
    const center = size / 2;
    const centerLat = 12 * Math.PI / 180;
    const sinCenterLat = Math.sin(centerLat);
    const cosCenterLat = Math.cos(centerLat);

    canvas.width = size;
    canvas.height = size;

    const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
    reducedMotionRef.current = motionPreference.matches;
    const onMotionPreferenceChange = (event: MediaQueryListEvent) => {
      reducedMotionRef.current = event.matches;
    };
    motionPreference.addEventListener('change', onMotionPreferenceChange);

    const onVisibilityChange = () => {
      pageVisibleRef.current = !document.hidden;
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    onVisibilityChange();

    let observer: IntersectionObserver | null = null;
    if ('IntersectionObserver' in window) {
      observer = new IntersectionObserver((entries) => {
        visibleRef.current = entries[0]?.isIntersecting ?? true;
        if (visibleRef.current) render();
      }, { threshold: 0.01 });
      observer.observe(canvas);
    }

    const contextResult = canvas.getContext('2d', { alpha: true });
    if (!contextResult) return;
    const context: CanvasRenderingContext2D = contextResult;

    const texture = document.createElement('canvas');
    texture.width = textureWidth;
    texture.height = textureHeight;
    const textureContextResult = texture.getContext('2d', { alpha: false });
    if (!textureContextResult) return;
    const textureContext: CanvasRenderingContext2D = textureContextResult;

    textureContext.fillStyle = '#56c8eb';
    textureContext.fillRect(0, 0, textureWidth, textureHeight);
    textureContext.lineJoin = 'round';
    textureContext.lineCap = 'round';

    const countries = worldCountries as unknown as CountryCollection;

    function projectTexturePoint(position: Position) {
      return {
        x: ((position[0] + 180) / 360) * textureWidth,
        y: ((90 - position[1]) / 180) * textureHeight,
      };
    }

    function drawPolygon(polygon: PolygonCoordinates, fill: string) {
      for (const wrapShift of [-textureWidth, 0, textureWidth]) {
        textureContext.beginPath();

        for (const ring of polygon) {
          let previousUnwrappedX: number | null = null;

          ring.forEach((position, index) => {
            const projected = projectTexturePoint(position);
            let unwrappedX = projected.x;

            if (previousUnwrappedX !== null) {
              while (unwrappedX - previousUnwrappedX > textureWidth / 2) unwrappedX -= textureWidth;
              while (unwrappedX - previousUnwrappedX < -textureWidth / 2) unwrappedX += textureWidth;
            }

            previousUnwrappedX = unwrappedX;
            const x = unwrappedX + wrapShift;

            if (index === 0) textureContext.moveTo(x, projected.y);
            else textureContext.lineTo(x, projected.y);
          });

          textureContext.closePath();
        }

        textureContext.fillStyle = fill;
        textureContext.fill('evenodd');
        textureContext.strokeStyle = 'rgba(255,255,255,.92)';
        textureContext.lineWidth = 1.25;
        textureContext.stroke();
      }
    }

    countries.features.forEach((feature, featureIndex) => {
      const colorIndex = typeof feature.properties.MAPCOLOR7 === 'number'
        ? Math.max(0, Math.min(COUNTRY_COLORS.length - 1, feature.properties.MAPCOLOR7 - 1))
        : featureIndex % COUNTRY_COLORS.length;
      const fill = COUNTRY_COLORS[colorIndex];

      if (feature.geometry.type === 'Polygon') {
        drawPolygon(feature.geometry.coordinates, fill);
      } else {
        feature.geometry.coordinates.forEach((polygon) => drawPolygon(polygon, fill));
      }
    });

    const texturePixels = textureContext.getImageData(0, 0, textureWidth, textureHeight).data;
    const frame = context.createImageData(size, size);
    const framePixels = frame.data;

    const destinationIndexes: number[] = [];
    const relativeLongitudes: number[] = [];
    const textureRows: number[] = [];

    for (let py = 0; py < size; py += 1) {
      for (let px = 0; px < size; px += 1) {
        const nx = (px + 0.5 - center) / radius;
        const ny = -(py + 0.5 - center) / radius;
        const rhoSquared = nx * nx + ny * ny;

        if (rhoSquared > 1) continue;

        const rho = Math.sqrt(rhoSquared);
        let latitude: number;
        let relativeLongitude: number;

        if (rho < 0.000001) {
          latitude = centerLat;
          relativeLongitude = 0;
        } else {
          const angularDistance = Math.asin(rho);
          const sinAngular = Math.sin(angularDistance);
          const cosAngular = Math.cos(angularDistance);

          latitude = Math.asin(
            cosAngular * sinCenterLat +
            (ny * sinAngular * cosCenterLat) / rho,
          );

          relativeLongitude = Math.atan2(
            nx * sinAngular,
            rho * cosCenterLat * cosAngular -
            ny * sinCenterLat * sinAngular,
          );
        }

        const latitudeDegrees = latitude * 180 / Math.PI;
        const row = Math.max(
          0,
          Math.min(
            textureHeight - 1,
            Math.floor(((90 - latitudeDegrees) / 180) * textureHeight),
          ),
        );

        destinationIndexes.push((py * size + px) * 4);
        relativeLongitudes.push(relativeLongitude * 180 / Math.PI);
        textureRows.push(row);
      }
    }

    const destinationIndexArray = Int32Array.from(destinationIndexes);
    const longitudeArray = Float32Array.from(relativeLongitudes);
    const textureRowArray = Uint16Array.from(textureRows);

    let animationFrame = 0;
    let lastTime = performance.now();
    let lastPaint = 0;
    let dragging = false;
    let lastPointerX = 0;
    let resumeAt = 0;

    function render() {
      const centerLongitude = rotationRef.current;

      for (let i = 0; i < destinationIndexArray.length; i += 1) {
        let longitude = longitudeArray[i] + centerLongitude;
        longitude = ((longitude + 180) % 360 + 360) % 360 - 180;

        const sourceX = Math.max(
          0,
          Math.min(
            textureWidth - 1,
            Math.floor(((longitude + 180) / 360) * textureWidth),
          ),
        );

        const sourceIndex = (textureRowArray[i] * textureWidth + sourceX) * 4;
        const destinationIndex = destinationIndexArray[i];

        framePixels[destinationIndex] = texturePixels[sourceIndex];
        framePixels[destinationIndex + 1] = texturePixels[sourceIndex + 1];
        framePixels[destinationIndex + 2] = texturePixels[sourceIndex + 2];
        framePixels[destinationIndex + 3] = 255;
      }

      context.clearRect(0, 0, size, size);
      context.putImageData(frame, 0, 0);

      context.beginPath();
      context.arc(center, center, radius, 0, Math.PI * 2);
      context.strokeStyle = 'rgba(80,156,202,.42)';
      context.lineWidth = 2;
      context.stroke();
    }

    function animate(now: number) {
      const delta = Math.min(50, now - lastTime);
      lastTime = now;

      const active = visibleRef.current && pageVisibleRef.current;

      if (
        active &&
        !reducedMotionRef.current &&
        healthRef.current !== 'issue' &&
        !dragging &&
        now >= resumeAt
      ) {
        rotationRef.current = (rotationRef.current - delta * 0.0065) % 360;
      }

      if (active && !reducedMotionRef.current && now - lastPaint >= 40) {
        render();
        lastPaint = now;
      }

      animationFrame = requestAnimationFrame(animate);
    }

    function pointerDown(event: PointerEvent) {
      dragging = true;
      lastPointerX = event.clientX;
      canvas.setPointerCapture(event.pointerId);
    }

    function pointerMove(event: PointerEvent) {
      if (!dragging) return;
      const deltaX = event.clientX - lastPointerX;
      lastPointerX = event.clientX;
      rotationRef.current = (rotationRef.current + deltaX * 0.45) % 360;
      render();
    }

    function pointerUp(event: PointerEvent) {
      dragging = false;
      resumeAt = performance.now() + 1800;
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    }

    canvas.addEventListener('pointerdown', pointerDown);
    canvas.addEventListener('pointermove', pointerMove);
    canvas.addEventListener('pointerup', pointerUp);
    canvas.addEventListener('pointercancel', pointerUp);

    render();
    animationFrame = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animationFrame);
      observer?.disconnect();
      motionPreference.removeEventListener('change', onMotionPreferenceChange);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      canvas.removeEventListener('pointerdown', pointerDown);
      canvas.removeEventListener('pointermove', pointerMove);
      canvas.removeEventListener('pointerup', pointerUp);
      canvas.removeEventListener('pointercancel', pointerUp);
    };
  }, []);

  return (
    <div className={`${styles.realGlobeShell} ${health === 'issue' ? styles.realGlobeIssue : ''}`}>
      <canvas
        ref={canvasRef}
        className={styles.localGlobeCanvas}
        aria-label="Interactive colorful ICA Unified world globe"
      />
      <div className={styles.globeHint}>{health === 'issue' ? 'SERVICE ISSUE · AUTO-SPIN PAUSED' : 'DRAG · AUTO-SPIN'}</div>
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
          data?.serviceReady === true &&
          data?.databaseReady === true;

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
        <small className={styles.mapCredit}>Local canvas globe · Map data: Natural Earth</small>
      </div>
    </div>
  );
}