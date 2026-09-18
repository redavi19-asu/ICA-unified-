'use client';

import { useEffect, useState } from 'react';
import styles from './UnifiedIntroLoader.module.css';

const stages = ['Connecting', 'Organizing', 'Preparing', 'Unified'];

export default function UnifiedIntroLoader() {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const duration = reduceMotion ? 1100 : 4000;
    const timer = window.setTimeout(() => setVisible(false), duration);
    return () => window.clearTimeout(timer);
  }, []);

  if (!visible) return null;

  return (
    <div className={styles.overlay} role="status" aria-live="polite" aria-label="ICA Unified is loading">
      <div className={styles.haloOne} />
      <div className={styles.haloTwo} />

      <main className={styles.center}>
        <div className={styles.eyebrow}>I Computer Anything</div>

        <div className={styles.brand} aria-label="ICA Unified">
          <span className={styles.red}>I</span>
          <span className={styles.orange}>C</span>
          <span className={styles.gray}>A</span>
        </div>

        <div className={styles.unified}>UNIFIED</div>
        <div className={styles.rule} />

        <div className={styles.stageWindow} aria-hidden="true">
          {stages.map((stage, index) => (
            <span
              key={stage}
              className={styles.stage}
              style={{ animationDelay: `${0.15 + index * 0.88}s` }}
            >
              {stage}
            </span>
          ))}
        </div>

        <p className={styles.message}>One company · One database · One login · One member record</p>
      </main>

      <div className={styles.progressWrap}>
        <span>Preparing your workspace</span>
        <div className={styles.progressTrack}>
          <div className={styles.progressBar} />
        </div>
      </div>
    </div>
  );
}
