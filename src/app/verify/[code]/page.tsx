import { notFound } from 'next/navigation';
import { prisma } from '../../../lib/prisma';

export default async function VerifyCredentialPage(props: { params: Promise<{ code: string }> }) {
  const params = await props.params;
  const credential = await prisma.credential.findUnique({
    where: { code: params.code },
    include: {
      user: { select: { name: true } },
      organization: { select: { name: true } },
      enrollment: { include: { course: { select: { title: true } } } },
    },
  });

  if (!credential) notFound();
  const expired = Boolean(credential.expiresAt && credential.expiresAt.getTime() < Date.now());
  const valid = credential.status === 'active' && !expired;

  return (
    <main style={{minHeight:'100vh',background:'#f1eee6',color:'#111316',padding:'clamp(24px,7vw,90px)',fontFamily:'Arial,sans-serif'}}>
      <section style={{maxWidth:980,margin:'0 auto'}}>
        <p style={{fontSize:10,letterSpacing:'.22em',color:'#767a78'}}>ICA UNIFIED / PUBLIC RECORD CHECK</p>
        <div style={{display:'flex',justifyContent:'space-between',gap:30,alignItems:'flex-end',borderBottom:'2px solid #111316',paddingBottom:22,marginTop:18}}>
          <h1 style={{fontSize:'clamp(54px,9vw,118px)',lineHeight:.75,letterSpacing:'-.07em',margin:0}}>VERIFY<br/>CREDENTIAL</h1>
          <div style={{fontSize:13,fontWeight:800,letterSpacing:'.12em',padding:'12px 16px',border:'1px solid #111316'}}>{valid ? '✓ VERIFIED ACTIVE' : 'RECORD NOT ACTIVE'}</div>
        </div>
        <section style={{marginTop:50,display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))',gap:1,background:'#cbc7bd',border:'1px solid #cbc7bd'}}>
          <Cell label="HOLDER" value={credential.user.name}/>
          <Cell label="ORGANIZATION" value={credential.organization.name}/>
          <Cell label="CREDENTIAL" value={credential.name}/>
          <Cell label="COURSE" value={credential.enrollment?.course.title || 'Verified credential'}/>
          <Cell label="ISSUED" value={credential.issuedAt?.toLocaleDateString() || '—'}/>
          <Cell label="EXPIRES" value={credential.expiresAt?.toLocaleDateString() || 'No expiration'}/>
        </section>
        <div style={{marginTop:34,borderTop:'1px solid #a9a59d',paddingTop:22}}>
          <span style={{display:'block',fontSize:10,letterSpacing:'.16em',color:'#777'}}>VERIFICATION CODE</span>
          <code style={{fontSize:'clamp(18px,3vw,30px)',display:'block',marginTop:8}}>{credential.code}</code>
        </div>
        <p style={{marginTop:46,maxWidth:700,color:'#666b68',lineHeight:1.6}}>This page confirms that the credential record exists in ICA Unified. A credential marked inactive or expired should not be treated as current.</p>
      </section>
    </main>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return <div style={{background:'#f1eee6',padding:'22px'}}><span style={{display:'block',fontSize:10,letterSpacing:'.14em',color:'#777'}}>{label}</span><strong style={{display:'block',fontSize:18,marginTop:10}}>{value}</strong></div>;
}
