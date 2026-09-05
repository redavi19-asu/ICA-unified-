'use client';

import { useEffect, useState } from 'react';
import styles from './landing.module.css';

type HealthState = 'checking' | 'connected' | 'issue';

export default function SystemStatusGlobe() {
  const [status, setStatus] = useState<HealthState>('checking');

  useEffect(() => {
    let mounted = true;
    let timer: ReturnType<typeof setInterval> | undefined;

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
          data?.database === 'connected';

        if (mounted) setStatus(connected ? 'connected' : 'issue');
      } catch {
        if (mounted) setStatus('issue');
      }
    }

    checkHealth();
    timer = setInterval(checkHealth, 60000);

    return () => {
      mounted = false;
      if (timer) clearInterval(timer);
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
        <div className={styles.orbitLine} aria-hidden="true" />
        <div className={styles.globe} aria-hidden="true">
          <div className={styles.globeGrid} />
          <div className={styles.globeLatitudeOne} />
          <div className={styles.globeLatitudeTwo} />
          <div className={styles.globeLongitudeOne} />
          <div className={styles.globeLongitudeTwo} />
          <div className={styles.globeScan} />
          <span className={styles.globeNodeOne} />
          <span className={styles.globeNodeTwo} />
          <span className={styles.globeNodeThree} />
          <span className={styles.globeNodeFour} />
        </div>

        <div className={styles.coreLabel}>
          <small>ONE SHARED PLATFORM</small>
          <strong>AMS + LMS</strong>
          <span>BUSINESS DATA CORE</span>
        </div>
      </div>

      <div className={styles.nodes}>
        <span>PEOPLE</span>
        <span>LEARNING</span>
        <span>CREDENTIALS</span>
        <span>DOCUMENTS</span>
        <span>COMPLIANCE</span>
        <span>REPORTING</span>
      </div>

      <div className={styles.systemBottom}>
        WEBSITE ↔ API ↔ ICA UNIFIED ↔ ORGANIZATION WORKSPACE
      </div>
    </div>
  );
}
