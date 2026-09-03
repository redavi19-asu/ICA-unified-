import { requirePlatformAdmin } from '../../lib/platform-auth';
import { prisma } from '../../lib/prisma';

export default async function PlatformPage() {
  const admin = await requirePlatformAdmin();
  const [organizations, userCount, courseCount] = await Promise.all([
    prisma.organization.findMany({
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { memberships: true, courses: true, credentials: true } } },
      take: 100,
    }),
    prisma.user.count(),
    prisma.course.count(),
  ]);

  return (
    <main style={{minHeight:'100vh',background:'#090a0c',color:'#f2efe8',padding:'clamp(24px,5vw,70px)'}}>
      <header style={{display:'flex',justifyContent:'space-between',gap:24,borderBottom:'1px solid #2d3035',paddingBottom:28,alignItems:'flex-end'}}>
        <div>
          <p style={{fontSize:10,letterSpacing:'.2em',color:'#7e8489'}}>ICA UNIFIED / PLATFORM LAYER</p>
          <h1 style={{fontSize:'clamp(52px,8vw,110px)',lineHeight:.78,letterSpacing:'-.07em',margin:'14px 0 0'}}>CONTROL<br/>PLANE</h1>
        </div>
        <div style={{textAlign:'right',fontSize:12,color:'#8c9196'}}><strong style={{display:'block',color:'#eeeae2'}}>{admin.name}</strong>{admin.role}</div>
      </header>

      <section style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:12,marginTop:28}}>
        <Metric label="ORGANIZATIONS" value={organizations.length}/>
        <Metric label="USERS" value={userCount}/>
        <Metric label="COURSES" value={courseCount}/>
        <Metric label="TRIALS" value={organizations.filter((o) => o.status === 'TRIAL').length}/>
      </section>

      <section style={{marginTop:42}}>
        <p style={{fontSize:10,letterSpacing:'.2em',color:'#7e8489'}}>CUSTOMER ORGANIZATIONS</p>
        <div style={{borderTop:'1px solid #2d3035'}}>
          {organizations.map((organization) => (
            <article key={organization.id} style={{display:'grid',gridTemplateColumns:'minmax(220px,1.4fr) repeat(4,minmax(90px,.5fr))',gap:16,alignItems:'center',padding:'20px 0',borderBottom:'1px solid #25282d'}}>
              <div><strong style={{fontSize:17}}>{organization.name}</strong><span style={{display:'block',fontSize:12,color:'#7f858a',marginTop:5}}>{organization.slug} · {organization.plan}</span></div>
              <div><small style={{color:'#747a80'}}>STATUS</small><strong style={{display:'block',marginTop:5}}>{organization.status}</strong></div>
              <div><small style={{color:'#747a80'}}>PEOPLE</small><strong style={{display:'block',fontSize:24}}>{organization._count.memberships}</strong></div>
              <div><small style={{color:'#747a80'}}>COURSES</small><strong style={{display:'block',fontSize:24}}>{organization._count.courses}</strong></div>
              <div><small style={{color:'#747a80'}}>CREDENTIALS</small><strong style={{display:'block',fontSize:24}}>{organization._count.credentials}</strong></div>
            </article>
          ))}
        </div>
      </section>
      <form action="/api/platform/logout" method="post" style={{marginTop:34}}><button style={{background:'transparent',border:'1px solid #464a50',color:'#ddd9d1',padding:'11px 15px',cursor:'pointer'}}>SIGN OUT OF PLATFORM</button></form>
    </main>
  );
}

function Metric({label,value}:{label:string;value:number}){
  return <div style={{borderTop:'1px solid #34373d',padding:'18px 2px'}}><span style={{fontSize:10,letterSpacing:'.14em',color:'#747a80'}}>{label}</span><strong style={{display:'block',fontSize:42,letterSpacing:'-.05em',marginTop:7}}>{value}</strong></div>;
}
