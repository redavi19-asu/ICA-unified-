'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function CheckinClient({
  token,
  eventName,
  credits,
  category,
}: {
  token: string;
  eventName: string;
  credits: number;
  category: string;
}) {
  const router = useRouter();
  const [state, setState] = useState<'READY' | 'WORKING' | 'DONE' | 'ERROR'>('READY');
  const [message, setMessage] = useState('Confirm your attendance to post it to your ICA Unified record.');

  async function checkIn() {
    setState('WORKING');
    const response = await fetch(`/api/checkin/${token}`, { method: 'POST' });
    const data = await response.json();
    if (!response.ok) {
      setState('ERROR');
      setMessage(data.error || 'Unable to check in.');
      return;
    }
    setState('DONE');
    setMessage(data.message || 'Attendance recorded.');
  }

  return (
    <main style={{minHeight:'100vh',background:'#0e1012',color:'#f4f1e9',display:'grid',placeItems:'center',padding:24,fontFamily:'Arial,sans-serif'}}>
      <section style={{width:'min(680px,100%)',border:'1px solid #34383c',background:'#15181b',padding:'clamp(24px,6vw,56px)',boxShadow:'0 30px 90px rgba(0,0,0,.35)'}}>
        <p style={{fontSize:11,letterSpacing:'.18em',color:'#8b9297'}}>ICA UNIFIED / EVENT ATTENDANCE</p>
        <h1 style={{fontSize:'clamp(42px,8vw,78px)',lineHeight:.9,letterSpacing:'-.05em',margin:'18px 0'}}>{eventName}</h1>
        <p style={{color:'#a9afb3',lineHeight:1.6}}>{message}</p>
        {credits > 0 && <div style={{margin:'28px 0',padding:18,border:'1px solid #30353a',display:'flex',justifyContent:'space-between',gap:20}}><span>{category}</span><strong>{credits} CREDIT{credits === 1 ? '' : 'S'}</strong></div>}
        {state !== 'DONE' ? (
          <button disabled={state === 'WORKING'} onClick={checkIn} style={{width:'100%',padding:'18px 20px',background:'#f1eee6',color:'#111',border:0,fontWeight:800,letterSpacing:'.08em',cursor:'pointer'}}>
            {state === 'WORKING' ? 'CHECKING IN…' : 'CONFIRM CHECK-IN'}
          </button>
        ) : (
          <button onClick={() => router.push('/my/wallet')} style={{width:'100%',padding:'18px 20px',background:'#f1eee6',color:'#111',border:0,fontWeight:800,letterSpacing:'.08em',cursor:'pointer'}}>
            OPEN MY CREDENTIAL + CE WALLET →
          </button>
        )}
      </section>
    </main>
  );
}
