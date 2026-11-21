'use client';

import { useState, type CSSProperties } from 'react';
import type { DEVELOPER_PLANS } from '../../../lib/developer-billing';

type Status = {
  enabled: boolean;
  plans: typeof DEVELOPER_PLANS;
  subscription: { plan: string | null; status: string; active: boolean; periodEnd: number } | null;
  usage: { used: number; included: number | null };
};
const card: CSSProperties = {
  padding: 26, borderRadius: 22, border: '1px solid #27445d',
  background: 'linear-gradient(150deg,#10283a,#0a1b2b)', minWidth: 0,
};
const cta: CSSProperties = {
  minHeight: 48, width: '100%', border: 0, borderRadius: 9, cursor: 'pointer',
  fontWeight: 800, background: '#258de0', color: '#fff', fontSize: 14, padding: '12px 18px',
};
export default function DeveloperBillingClient({ initial }: { initial: Status }) {
  const [state, setState] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function launch(action: 'checkout' | 'portal', plan?: 'starter' | 'pro') {
    if (busy || !state.enabled) return;
    setBusy(true); setMessage('');
    try {
      const response = await fetch('/api/integrations/developer-billing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, plan }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Developer billing unavailable.');
      const url = new URL(data.url);
      if (url.protocol !== 'https:' || !['checkout.stripe.com', 'billing.stripe.com'].includes(url.hostname))
        throw new Error('Invalid Stripe checkout destination.');
      window.location.assign(url.toString());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to launch billing.');
      setBusy(false);
    }
  }

  return <div style={{ marginTop: 35 }}>
    <div style={{ ...card, marginBottom: 20, background: '#0a2333' }}>
      <h2 style={{ fontSize: 19, marginTop: 0 }}>Developer subscription status</h2>
      <p style={{ color: '#bfd4e2' }}>
        {state.subscription ? (state.subscription.plan || 'Unassigned') + ' · ' + state.subscription.status : 'No developer subscription'}
      </p>
      <p style={{ fontSize: 15, color: '#bfd4e2' }}>
        API calls this billing period: <strong style={{ color: '#fff' }}>{state.usage.used.toLocaleString()}</strong>
        {state.usage.included !== null && ' / ' + state.usage.included.toLocaleString() + ' included'}
      </p>
      {state.subscription && <button type="button" disabled={!state.enabled || busy}
        onClick={() => void launch('portal')}
        style={{ ...cta, width: 'auto', opacity: state.enabled ? 1 : .4 }}>Manage developer billing</button>}
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(255px,1fr))', gap: 16 }}>
      {(['starter', 'pro'] as const).map(plan => {
        const item = state.plans[plan];
        return <section key={plan} style={card}>
          <p style={{ fontSize: 11, color: '#67c4ff', fontWeight: 800, letterSpacing: '.18em' }}>DEVELOPER {plan.toUpperCase()}</p>
          <h3 style={{ fontSize: 42, margin: '12px 0' }}>${(item.priceCents / 100).toFixed(2)}<span style={{ fontSize: 15, color: '#91aabd', fontWeight: 400 }}>/month</span></h3>
          <p style={{ color: '#afc5d7', marginBottom: 28 }}>{item.monthlyCalls.toLocaleString()} API calls included in a billing period. No overage charges.</p>
          <button type="button" style={{ ...cta, opacity: !state.enabled || busy || state.subscription?.active ? .45 : 1 }}
            disabled={!state.enabled || busy || Boolean(state.subscription?.active)}
            onClick={() => void launch('checkout', plan)}>
            {!state.enabled ? 'Checkout not activated' : state.subscription?.active ? 'Existing subscription' : 'Choose plan'}
          </button>
        </section>;
      })}
    </div>
    {!state.enabled && <p style={{ marginTop: 20, color: '#c1a278', fontSize: 13 }}>
      Proposed launch prices. Purchase controls stay disabled until new Stripe prices and production webhook verification are complete.
      Existing organization API access is unchanged.
    </p>}
    {message && <p role="alert" style={{ marginTop: 18, color: '#ffd39b' }}>{message}</p>}
    <button type="button" onClick={async () => {
      try { const r = await fetch('/api/integrations/developer-billing', { cache: 'no-store' });
        if (!r.ok) throw new Error('Could not refresh developer status.');
        setState(await r.json()); setMessage('');
      } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not refresh status.'); }
    }} style={{ background: 'transparent', color: '#70bded', border: '1px solid #2b5170', marginTop: 20, minHeight: 44, padding: '10px 18px', borderRadius: 10, cursor: 'pointer' }}>
      Refresh billing status
    </button>
  </div>;
}
