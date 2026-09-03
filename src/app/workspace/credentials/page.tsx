import { requireSession } from '../../../lib/auth';
import { prisma } from '../../../lib/prisma';

export default async function CredentialsPage() {
  const { membership } = await requireSession();
  const credentials = await prisma.credential.findMany({
    where: { organizationId: membership.organizationId },
    orderBy: [{ expiresAt: 'asc' }, { issuedAt: 'desc' }],
    include: {
      user: { select: { name: true, email: true } },
      enrollment: { include: { course: { select: { title: true } } } },
    },
  });

  const now = new Date();
  const active = credentials.filter((item) => item.status === 'active' && (!item.expiresAt || item.expiresAt > now)).length;
  const expiring = credentials.filter((item) => item.expiresAt && item.expiresAt > now && item.expiresAt.getTime() - now.getTime() < 30 * 86400000).length;
  const expired = credentials.filter((item) => Boolean(item.expiresAt && item.expiresAt <= now)).length;

  return (
    <main style={{minHeight:'100vh',background:'#111214',color:'#efede7',padding:'clamp(24px,5vw,70px)',fontFamily:'Arial,sans-serif'}}>
      <a href="/workspace" style={{color:'#8a9094',textDecoration:'none',fontSize:11,letterSpacing:'.14em'}}>← CONTROL PLANE</a>
      <header style={{display:'flex',justifyContent:'space-between',gap:24,alignItems:'flex-end',borderBottom:'1px solid #303337',paddingBottom:28,marginTop:25}}>
        <div><p style={{fontSize:10,letterSpacing:'.2em',color:'#7f8589'}}>{membership.organization.name.toUpperCase()} / VERIFIED RECORDS</p><h1 style={{fontSize:'clamp(54px,8vw,108px)',lineHeight:.76,letterSpacing:'-.07em',margin:'14px 0 0'}}>CREDENTIAL<br/>FIELD</h1></div>
        <p style={{maxWidth:430,color:'#8a9094',lineHeight:1.5}}>Certificates issued by completed training remain tied to the employee, company, score, expiration date, and public verification code.</p>
      </header>

      <section style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:1,background:'#292d30',marginTop:28}}>
        <Metric label="TOTAL" value={credentials.length}/><Metric label="ACTIVE" value={active}/><Metric label="EXPIRING 30D" value={expiring}/><Metric label="EXPIRED" value={expired}/>
      </section>

      <section style={{marginTop:38,borderTop:'1px solid #2b2f32'}}>
        {credentials.length === 0 ? <p style={{color:'#80868a',padding:'28px 0'}}>No credentials have been issued yet.</p> : credentials.map((credential) => {
          const isExpired = Boolean(credential.expiresAt && credential.expiresAt <= now);
          return (
            <article key={credential.id} style={{display:'grid',gridTemplateColumns:'1.5fr 1fr .7fr .7fr',gap:18,padding:'22px 0',borderBottom:'1px solid #272a2d',alignItems:'center'}}>
              <div><strong style={{fontSize:17}}>{credential.name}</strong><span style={{display:'block',color:'#7f8589',fontSize:12,marginTop:6}}>{credential.user.name} · {credential.user.email}</span></div>
              <div><small style={{color:'#737a7e'}}>COURSE</small><strong style={{display:'block',marginTop:5}}>{credential.enrollment?.course.title || 'Credential record'}</strong></div>
              <div><small style={{color:'#737a7e'}}>STATUS</small><strong style={{display:'block',marginTop:5}}>{isExpired ? 'EXPIRED' : credential.status.toUpperCase()}</strong></div>
              <div><small style={{color:'#737a7e'}}>VERIFY</small>{credential.code ? <a href={`/verify/${credential.code}`} style={{display:'block',marginTop:5,color:'#efede7'}}>OPEN →</a> : <strong style={{display:'block',marginTop:5}}>—</strong>}</div>
            </article>
          );
        })}
      </section>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div style={{background:'#151719',padding:'18px'}}><span style={{fontSize:10,letterSpacing:'.14em',color:'#737a7e'}}>{label}</span><strong style={{display:'block',fontSize:40,marginTop:8}}>{String(value).padStart(2,'0')}</strong></div>;
}
