'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * A short, bounded retry helps buyers whose payment is still settling.
 * Verified server-side payment checks remain the sole source of truth.
 */
export default function PaymentProcessingRefresh() {
  const router = useRouter();
  const [checks, setChecks] = useState(0);

  useEffect(() => {
    if (checks >= 10) return;
    const timeout = window.setTimeout(() => {
      router.refresh();
      setChecks((value) => value + 1);
    }, 6000);
    return () => window.clearTimeout(timeout);
  }, [checks, router]);

  return (
    <div aria-live="polite" style={{ marginTop: 18 }}>
      {checks < 10
        ? <p>Checking your payment automatically. You can leave this page; the business will still receive confirmation once payment is verified.</p>
        : <>
            <p>Your payment is taking longer than usual. Please do not pay a second time.</p>
            <button type="button" onClick={() => router.refresh()}>Check payment again</button>
          </>}
    </div>
  );
}
