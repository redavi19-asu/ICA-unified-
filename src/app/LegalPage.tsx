import Link from 'next/link';
import type { ReactNode } from 'react';

export default function LegalPage({
  eyebrow,
  title,
  updated = 'September 17, 2026',
  children,
}: {
  eyebrow: string;
  title: string;
  updated?: string;
  children: ReactNode;
}) {
  return (
    <main style={{minHeight:'100vh',background:'#f8fbfd',color:'#142b3d',padding:'clamp(28px,6vw,76px) 20px'}}>
      <article style={{maxWidth:900,margin:'0 auto',background:'#fff',border:'1px solid #d9e6ee',borderRadius:24,padding:'clamp(26px,5vw,58px)',boxShadow:'0 24px 70px rgba(31,69,96,.08)'}}>
        <Link href="/" style={{display:'inline-block',marginBottom:34,color:'#147fd1',fontSize:11,fontWeight:900,letterSpacing:'.1em',textDecoration:'none'}}>← ICA UNIFIED</Link>
        <p style={{margin:0,color:'#147fd1',fontSize:10,fontWeight:900,letterSpacing:'.18em'}}>{eyebrow}</p>
        <h1 style={{fontSize:'clamp(44px,7vw,78px)',lineHeight:.94,letterSpacing:'-.05em',margin:'12px 0 14px'}}>{title}</h1>
        <p style={{margin:'0 0 38px',color:'#748a99',fontSize:12}}>Last updated {updated}</p>
        <div style={{display:'grid',gap:30,lineHeight:1.75,color:'#4e6677',fontSize:15}}>{children}</div>
        <div style={{marginTop:46,paddingTop:22,borderTop:'1px solid #dce7ee',display:'flex',gap:18,flexWrap:'wrap',fontSize:12}}>
          <Link href="/privacy" style={{color:'#147fd1',textDecoration:'none',fontWeight:800}}>Privacy</Link>
          <Link href="/terms" style={{color:'#147fd1',textDecoration:'none',fontWeight:800}}>Terms</Link>
          <Link href="/cancellation" style={{color:'#147fd1',textDecoration:'none',fontWeight:800}}>Cancellation & Billing</Link>
          <a href="https://icomputeranything.com/#contact" style={{color:'#147fd1',textDecoration:'none',fontWeight:800}}>Contact ICA</a>
        </div>
      </article>
    </main>
  );
}

export function LegalSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 style={{margin:'0 0 8px',fontSize:22,color:'#183247',letterSpacing:'-.02em'}}>{title}</h2>
      <div style={{display:'grid',gap:10}}>{children}</div>
    </section>
  );
}
