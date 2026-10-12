'use client';
import { useEffect,useState } from 'react';
import Link from 'next/link';

type Status = {scope:string;status:string;resolvedAt:string|null;message:string|null;
  expectedCompletionAt:string|null;trainingExpiresAt:number|null;archivedRecordsRemoved:boolean};
export default function DeletionStatusPage() {
  const [receipt,setReceipt]=useState(''); const [status,setStatus]=useState<Status|null>(null); const [error,setError]=useState('');
  async function refresh(token:string) {
    try {
      const response=await fetch('/api/account/deletion-status',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({receipt:token}),cache:'no-store'});
      const data=await response.json(); if(!response.ok) throw new Error(data.error || 'Unable to read status.'); setStatus(data);setError('');
    } catch(caught) {setError(caught instanceof Error?caught.message:'Unable to read status.');}
  }
  useEffect(()=>{
    const token=new URLSearchParams(window.location.hash.slice(1)).get('receipt') || '';
    setReceipt(token); if(token) void refresh(token); else setError('Open the private status link saved when you submitted your request.');
  },[]);
  return <main style={{maxWidth:720,margin:'auto',padding:'48px 24px',lineHeight:1.6}}>
    <Link href="/">ICA Unified</Link><h1>Your deletion request</h1>
    <p>This private link remains available after account removal. Keep it private.</p>
    {status && <section aria-live="polite">
      <h2>{status.status.replaceAll('_',' ')}</h2>
      {status.message && <p>{status.message}</p>}
      {status.expectedCompletionAt && status.status!=='COMPLETED' && <p>Expected completion: {new Date(status.expectedCompletionAt).toLocaleDateString()}</p>}
      {status.resolvedAt && <p>Resolved: {new Date(status.resolvedAt).toLocaleString()}</p>}
      {status.trainingExpiresAt && <p>{status.archivedRecordsRemoved?'The retained training archive has been removed.':`Training archive expiry: ${new Date(status.trainingExpiresAt).toLocaleDateString()}. Expired archives are purged by the scheduled cleanup.`}</p>}
    </section>}
    {error && <p role="alert">{error}</p>}
    <button disabled={!receipt} onClick={()=>void refresh(receipt)}>Refresh status</button>
  </main>;
}
