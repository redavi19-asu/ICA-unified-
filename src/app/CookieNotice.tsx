'use client';

import { useEffect, useState } from 'react';
import styles from './CookieNotice.module.css';

const STORAGE_KEY = 'ica_cookie_notice_dismissed';

export default function CookieNotice() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(window.localStorage.getItem(STORAGE_KEY) !== '1');
  }, []);

  function dismiss() {
    window.localStorage.setItem(STORAGE_KEY, '1');
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <aside className={styles.notice} aria-label="Cookie notice">
      <div>
        <strong>Cookies</strong>
        <span>ICA Unified uses essential cookies for secure sign-in and account access.</span>
      </div>
      <button type="button" onClick={dismiss} aria-label="Dismiss cookie notice">OK</button>
    </aside>
  );
}
