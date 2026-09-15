'use client';

import { useState } from 'react';

export default function BillingSetupClient({
  organizationName,
  monthlyPrice,
  stripeReady,
}: {
  organizationName: string;
  monthlyPrice: number;
  stripeReady: boolean;
}) {
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');

  async function openCheckout() {
    setWorking(true);
    setError('');
    try {
      const response = await fetch('/api/billing/checkout', { method: 'POST' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to open Stripe Checkout.');
      window.location.assign(data.checkoutUrl);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to open Stripe Checkout.');
      setWorking(false);
    }
  }

  return (
    <main style={shell}>
      <section style={card}>
        <p style={eyebrow}>ICA UNIFIED / SUBSCRIPTION SETUP</p>
        <h1 style={title}>Your workspace is built.<br />Now activate the trial.</h1>
        <p style={copy}>
          {organizationName} gets 14 days of ICA Unified Professional. Stripe securely stores the payment method.
          Nothing is charged today; the subscription becomes ${monthlyPrice}/month after the trial unless cancelled.
        </p>

        <div style={priceRow}>
          <div><span style={label}>TODAY</span><strong style={price}>$0</strong><small style={small}>14-day trial</small></div>
          <div><span style={label}>AFTER TRIAL</span><strong style={price}>${monthlyPrice}</strong><small style={small}>per month</small></div>
          <div><span style={label}>SUPPORT</span><strong style={{...price,fontSize:24}}>INCLUDED</strong><small style={small}>standard support</small></div>
        </div>

        <button onClick={openCheckout} disabled={working || !stripeReady} style={{...button,opacity:(!stripeReady || working)?.55:1}}>
          {working ? 'OPENING STRIPE…' : stripeReady ? 'CONTINUE TO SECURE CHECKOUT →' : 'STRIPE CONNECTION PENDING'}
        </button>
        {error && <p style={errorStyle}>{error}</p>}

        <div style={flow}>
          <span>1 · COMPANY CREATED</span><b>→</b><span>2 · STRIPE TRIAL</span><b>→</b><span>3 · GET THE APPS</span>
        </div>
        <p style={fine}>After Stripe confirms the trial, ICA sends the organization directly to its Web / Windows / Mac access page.</p>
      </section>
    </main>
  );
}

const shell: React.CSSProperties={minHeight:'100vh',display:'grid',placeItems:'center',padding:24,background:'#07101a',color:'#edf6ff',fontFamily:'Arial,sans-serif'};
const card: React.CSSProperties={width:'min(920px,100%)',border:'1px solid #24435d',background:'linear-gradient(145deg,#0b1b2a,#07111b)',padding:'clamp(28px,5vw,58px)',boxShadow:'0 35px 100px rgba(0,0,0,.35)'};
const eyebrow: React.CSSProperties={fontSize:10,letterSpacing:'.2em',color:'#5eb8ff',fontWeight:800};
const title: React.CSSProperties={fontSize:'clamp(40px,6vw,72px)',lineHeight:.95,letterSpacing:'-.055em',margin:'14px 0 22px'};
const copy: React.CSSProperties={maxWidth:760,color:'#9db0c0',fontSize:17,lineHeight:1.7};
const priceRow: React.CSSProperties={display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:1,background:'#20384d',margin:'30px 0'};
const label: React.CSSProperties={display:'block',fontSize:9,letterSpacing:'.15em',color:'#6e8da4'};
const price: React.CSSProperties={display:'block',fontSize:42,marginTop:8};
const small: React.CSSProperties={display:'block',color:'#8398a8',fontSize:11,marginTop:4};
const button: React.CSSProperties={width:'100%',minHeight:56,border:0,borderRadius:7,background:'#178cff',color:'#fff',fontWeight:900,letterSpacing:'.08em',cursor:'pointer'};
const flow: React.CSSProperties={display:'flex',flexWrap:'wrap',gap:12,alignItems:'center',marginTop:26,color:'#71bfff',fontSize:9,letterSpacing:'.1em'};
const fine: React.CSSProperties={color:'#687f90',fontSize:11,lineHeight:1.6,marginTop:14};
const errorStyle: React.CSSProperties={color:'#ff7e88',fontSize:13};
