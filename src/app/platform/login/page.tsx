'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import TurnstileWidget from '../../TurnstileWidget';

export default function PlatformLoginPage() {
  const router = useRouter();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState('');
  const [turnstileReset, setTurnstileReset] = useState(0);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError('');
    const form = new FormData(event.currentTarget);

    const response = await fetch('/api/platform/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: form.get('email'),
        password: form.get('password'),
        turnstileToken,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      setError(data.error || 'Unable to sign in.');
      setLoading(false);
      setTurnstileToken('');
      setTurnstileReset((value) => value + 1);
      return;
    }

    router.push('/platform');
    router.refresh();
  }

  return (
    <main style={{minHeight:'100vh',display:'grid',placeItems:'center',padding:24,background:'#08090b',color:'#f4f0e8'}}>
      <section style={{width:'min(520px,100%)',border:'1px solid #30333a',padding:'clamp(28px,6vw,58px)',clipPath:'polygon(0 0,94% 0,100% 8%,100% 100%,6% 100%,0 92%)'}}>
        <p style={{letterSpacing:'.2em',fontSize:10,color:'#858a90'}}>ICA UNIFIED / PLATFORM CONTROL</p>
        <h1 style={{fontSize:'clamp(48px,9vw,86px)',lineHeight:.82,letterSpacing:'-.07em',margin:'18px 0 36px'}}>SUPER<br/>ADMIN</h1>

        <form onSubmit={submit} style={{display:'grid',gap:18}}>
          <label style={{display:'grid',gap:8,fontSize:11,color:'#90959a'}}>
            EMAIL
            <input name="email" type="email" required style={{background:'transparent',border:'0',borderBottom:'1px solid #444850',color:'white',padding:'12px 0',fontSize:16}} />
          </label>

          <label style={{display:'grid',gap:8,fontSize:11,color:'#90959a'}}>
            PASSWORD
            <input name="password" type="password" minLength={8} required style={{background:'transparent',border:'0',borderBottom:'1px solid #444850',color:'white',padding:'12px 0',fontSize:16}} />
          </label>

          <div style={{padding:'4px 0'}}>
            <TurnstileWidget onToken={setTurnstileToken} resetKey={turnstileReset} theme="dark" />
          </div>

          <button
            disabled={loading || !turnstileToken}
            style={{
              marginTop:10,
              padding:15,
              border:0,
              fontWeight:800,
              cursor:turnstileToken && !loading ? 'pointer' : 'not-allowed',
              opacity:turnstileToken && !loading ? 1 : .55,
            }}
          >
            {loading ? 'VERIFYING…' : 'ENTER PLATFORM CONTROL →'}
          </button>
        </form>

        {error && <p style={{color:'#e58f8f'}}>{error}</p>}
        <p style={{fontSize:12,color:'#73787d',marginTop:24}}>This entrance is separate from every customer organization workspace.</p>
      </section>
    </main>
  );
}
