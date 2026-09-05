import { requirePlatformAdmin } from '../../lib/platform-auth';
import { prisma } from '../../lib/prisma';
import Link from 'next/link';

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

  const canControl = admin.role === 'SUPER_ADMIN' || admin.role === 'PLATFORM_ADMIN';

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
        <div style={{borderTop:'1px solid #34373d',padding:'18px 2px'}}>
          <span style={{fontSize:10,letterSpacing:'.14em',color:'#747a80'}}>PLATFORM HEALTH</span>
          <strong style={{display:'flex',alignItems:'center',gap:8,fontSize:16,marginTop:15,color:'#55e69a'}}><i style={{width:8,height:8,borderRadius:'50%',background:'#55e69a',boxShadow:'0 0 12px rgba(85,230,154,.9)'}}/> D1 CONNECTED</strong>
        </div>
      </section>

      <section style={{marginTop:42}}>
        <p style={{fontSize:10,letterSpacing:'.2em',color:'#7e8489'}}>CUSTOMER ORGANIZATIONS</p>
        <div style={{borderTop:'1px solid #2d3035'}}>
          {organizations.map((organization) => (
            <article key={organization.id} style={{display:'grid',gridTemplateColumns:'minmax(220px,1.35fr) repeat(3,minmax(90px,.45fr)) minmax(170px,.75fr)',gap:16,alignItems:'center',padding:'20px 0',borderBottom:'1px solid #25282d'}}>
              <div><strong style={{fontSize:17}}>{organization.name}</strong><span style={{display:'block',fontSize:12,color:'#7f858a',marginTop:5}}>{organization.slug} · {organization.plan} · {organization.status}</span></div>
              <div><small style={{color:'#747a80'}}>PEOPLE</small><strong style={{display:'block',fontSize:24}}>{organization._count.memberships}</strong></div>
              <div><small style={{color:'#747a80'}}>COURSES</small><strong style={{display:'block',fontSize:24}}>{organization._count.courses}</strong></div>
              <div><small style={{color:'#747a80'}}>CREDENTIALS</small><strong style={{display:'block',fontSize:24}}>{organization._count.credentials}</strong></div>
              <div style={{display:'flex',gap:7,flexWrap:'wrap'}}>
                <Link href={`/platform/organizations/${organization.id}`} style={{...actionStyle,textDecoration:'none',borderColor:'#2a8bc1',color:'#bfe8ff'}}>DIAGNOSE</Link>
                {canControl ? <form action={`/api/platform/organizations/${organization.id}`} method="post" style={{display:'flex',gap:7,flexWrap:'wrap'}}>
                  {organization.status === 'SUSPENDED' ? <button name="status" value="ACTIVE" style={actionStyle}>ACTIVATE</button> : <button name="status" value="SUSPENDED" style={actionStyle}>SUSPEND</button>}
                  {organization.status === 'TRIAL' && <button name="status" value="ACTIVE" style={actionStyle}>APPROVE</button>}
                </form> : <small style={{color:'#747a80'}}>READ ONLY</small>}
              </div>
            </article>
          ))}
        </div>
      </section>
      <section style={{marginTop:42,borderTop:'1px solid #2d3035',paddingTop:28}}>
        <p style={{fontSize:10,letterSpacing:'.2em',color:'#7e8489'}}>SECURITY & ACCESS</p>
        <h2 style={{fontSize:28,margin:'10px 0 18px'}}>Change Super Admin password</h2>
        <form action="/api/platform/password" method="post" style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr)) auto',gap:10,maxWidth:900}}>
          <input name="currentPassword" type="password" minLength={8} required placeholder="Current password" autoComplete="current-password" style={{background:'#0f1115',border:'1px solid #3a3f46',color:'#f2efe8',padding:'11px 12px'}}/>
          <input name="newPassword" type="password" minLength={12} required placeholder="New password (12+ characters)" autoComplete="new-password" style={{background:'#0f1115',border:'1px solid #3a3f46',color:'#f2efe8',padding:'11px 12px'}}/>
          <button style={{...actionStyle,borderColor:'#2a8bc1',color:'#bfe8ff'}}>CHANGE PASSWORD</button>
        </form>
        <p style={{fontSize:11,color:'#717980',lineHeight:1.6,marginTop:10}}>Your existing password is never displayed. Changing it requires the current password.</p>
      </section>

      <form action="/api/platform/logout" method="post" style={{marginTop:34}}><button style={actionStyle}>SIGN OUT OF PLATFORM</button></form>
    </main>
  );
}

const actionStyle = {background:'transparent',border:'1px solid #464a50',color:'#ddd9d1',padding:'9px 11px',cursor:'pointer',fontSize:10,letterSpacing:'.08em'} as const;

function Metric({label,value}:{label:string;value:number}){
  return <div style={{borderTop:'1px solid #34373d',padding:'18px 2px'}}><span style={{fontSize:10,letterSpacing:'.14em',color:'#747a80'}}>{label}</span><strong style={{display:'block',fontSize:42,letterSpacing:'-.05em',marginTop:7}}>{value}</strong></div>;
}
