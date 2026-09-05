import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requirePlatformAdmin } from '../../../../lib/platform-auth';
import { prisma } from '../../../../lib/prisma';

function DiagnosticRow({label, value, status = 'ok'}:{label:string;value:string|number;status?:'ok'|'warn'|'error'}) {
  const color = status === 'ok' ? '#55e69a' : status === 'warn' ? '#f0c15d' : '#ff6b75';
  return (
    <div style={{display:'grid',gridTemplateColumns:'minmax(180px,1fr) minmax(120px,.6fr) 90px',gap:16,padding:'14px 0',borderBottom:'1px solid #25282d',alignItems:'center'}}>
      <span style={{color:'#b7bdc3'}}>{label}</span>
      <strong>{value}</strong>
      <span style={{color,fontSize:10,letterSpacing:'.1em'}}>{status.toUpperCase()}</span>
    </div>
  );
}

export default async function OrganizationDiagnosticsPage(props:{params:Promise<{id:string}>}) {
  await requirePlatformAdmin();
  const { id } = await props.params;

  const organization = await prisma.organization.findUnique({ where:{ id } });
  if (!organization) notFound();

  const [
    memberships,
    membershipCount,
    activeMemberships,
    suspendedMemberships,
    courseCount,
    enrollmentCount,
    credentialCount,
    documentCount,
    activityCount,
    crossTenantEnrollments,
    crossTenantCredentials,
    crossTenantDocuments,
  ] = await Promise.all([
    prisma.membership.findMany({
      where:{ organizationId:id },
      include:{ user:true },
      orderBy:{ joinedAt:'asc' },
    }),
    prisma.membership.count({ where:{ organizationId:id } }),
    prisma.membership.count({ where:{ organizationId:id, status:'ACTIVE' } }),
    prisma.membership.count({ where:{ organizationId:id, status:'SUSPENDED' } }),
    prisma.course.count({ where:{ organizationId:id } }),
    prisma.enrollment.count({ where:{ organizationId:id } }),
    prisma.credential.count({ where:{ organizationId:id } }),
    prisma.document.count({ where:{ organizationId:id } }),
    prisma.activity.count({ where:{ organizationId:id } }),
    prisma.enrollment.count({
      where:{
        organizationId:id,
        OR:[
          { user:{ memberships:{ none:{ organizationId:id } } } },
          { course:{ organizationId:{ not:id } } },
        ],
      },
    }),
    prisma.credential.count({
      where:{
        organizationId:id,
        user:{ memberships:{ none:{ organizationId:id } } },
      },
    }),
    prisma.acknowledgment.count({
      where:{
        organizationId:id,
        document:{ organizationId:{ not:id } },
      },
    }),
  ]);

  const integrityIssues = crossTenantEnrollments + crossTenantCredentials + crossTenantDocuments;
  const accountStatus = ['SUSPENDED','CANCELLED'].includes(organization.status) ? 'warn' : 'ok';
  const overall = integrityIssues > 0 ? 'error' : accountStatus;

  return (
    <main style={{minHeight:'100vh',background:'#090a0c',color:'#f2efe8',padding:'clamp(24px,5vw,70px)'}}>
      <header style={{display:'flex',justifyContent:'space-between',gap:20,alignItems:'flex-start',borderBottom:'1px solid #2d3035',paddingBottom:26}}>
        <div>
          <Link href="/platform" style={{color:'#9ccde8',textDecoration:'none',fontSize:11}}>← PLATFORM CONTROL</Link>
          <p style={{fontSize:10,letterSpacing:'.18em',color:'#777f86',marginTop:20}}>ORGANIZATION DIAGNOSTICS</p>
          <h1 style={{fontSize:'clamp(38px,6vw,76px)',letterSpacing:'-.055em',margin:'8px 0 4px'}}>{organization.name}</h1>
          <span style={{color:'#7f858a',fontSize:12}}>{organization.slug} · {organization.plan} · {organization.status}</span>
        </div>
        <div style={{border:'1px solid #333942',padding:'14px 16px',minWidth:190}}>
          <small style={{display:'block',color:'#777f86',letterSpacing:'.12em'}}>DIAGNOSTIC RESULT</small>
          <strong style={{display:'block',marginTop:9,color:overall==='ok'?'#55e69a':overall==='warn'?'#f0c15d':'#ff6b75'}}>
            {overall==='ok'?'● OPERATIONAL':overall==='warn'?'● ATTENTION':'● ISSUE FOUND'}
          </strong>
        </div>
      </header>

      <section style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:12,marginTop:28}}>
        {[
          ['PEOPLE',membershipCount],
          ['COURSES',courseCount],
          ['ENROLLMENTS',enrollmentCount],
          ['CREDENTIALS',credentialCount],
          ['DOCUMENTS',documentCount],
          ['ACTIVITY',activityCount],
        ].map(([label,value])=>(
          <div key={label} style={{borderTop:'1px solid #34373d',padding:'18px 2px'}}>
            <span style={{fontSize:10,letterSpacing:'.14em',color:'#747a80'}}>{label}</span>
            <strong style={{display:'block',fontSize:34,marginTop:7}}>{value}</strong>
          </div>
        ))}
      </section>

      <section style={{marginTop:40}}>
        <p style={{fontSize:10,letterSpacing:'.18em',color:'#777f86'}}>SECURITY & ACCESS</p>
        <div style={{borderTop:'1px solid #2d3035'}}>
          {memberships.map((membership) => (
            <article key={membership.id} style={{display:'grid',gridTemplateColumns:'minmax(220px,1fr) 120px minmax(300px,1.2fr)',gap:18,alignItems:'center',padding:'16px 0',borderBottom:'1px solid #25282d'}}>
              <div>
                <strong style={{display:'block'}}>{membership.user.name}</strong>
                <span style={{display:'block',fontSize:12,color:'#7f858a',marginTop:4}}>{membership.user.email}</span>
              </div>
              <div>
                <small style={{display:'block',color:'#747a80'}}>ROLE</small>
                <strong style={{fontSize:12}}>{membership.role}</strong>
              </div>
              <form action={`/api/platform/organizations/${organization.id}/users/${membership.userId}/password`} method="post" style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
                <input
                  name="newPassword"
                  type="password"
                  minLength={12}
                  required
                  placeholder="New temporary password"
                  autoComplete="new-password"
                  style={{flex:'1 1 210px',background:'#0f1115',border:'1px solid #3a3f46',color:'#f2efe8',padding:'10px 11px'}}
                />
                <button style={{background:'transparent',border:'1px solid #2a8bc1',color:'#bfe8ff',padding:'10px 12px',cursor:'pointer',fontSize:10,letterSpacing:'.08em'}}>RESET PASSWORD</button>
              </form>
            </article>
          ))}
        </div>
        <p style={{fontSize:11,color:'#717980',lineHeight:1.6,marginTop:12}}>Passwords are never displayed. Super Admin can only replace a password with a new temporary one.</p>
      </section>

      <section style={{marginTop:40,display:'grid',gridTemplateColumns:'minmax(0,1.25fr) minmax(280px,.75fr)',gap:28}}>
        <div>
          <p style={{fontSize:10,letterSpacing:'.18em',color:'#777f86'}}>AUTOMATED CHECKS</p>
          <div style={{borderTop:'1px solid #2d3035'}}>
            <DiagnosticRow label="Cloud database access" value="Connected" status="ok" />
            <DiagnosticRow label="Organization account" value={organization.status} status={accountStatus} />
            <DiagnosticRow label="Active memberships" value={activeMemberships} status="ok" />
            <DiagnosticRow label="Suspended memberships" value={suspendedMemberships} status={suspendedMemberships ? 'warn' : 'ok'} />
            <DiagnosticRow label="Cross-tenant enrollment mismatches" value={crossTenantEnrollments} status={crossTenantEnrollments ? 'error' : 'ok'} />
            <DiagnosticRow label="Cross-tenant credential mismatches" value={crossTenantCredentials} status={crossTenantCredentials ? 'error' : 'ok'} />
            <DiagnosticRow label="Cross-tenant document mismatches" value={crossTenantDocuments} status={crossTenantDocuments ? 'error' : 'ok'} />
          </div>
        </div>

        <aside style={{border:'1px solid #2d3035',padding:22,alignSelf:'start'}}>
          <p style={{fontSize:10,letterSpacing:'.18em',color:'#777f86'}}>DIAGNOSTIC CODES</p>
          <p style={{fontSize:13,lineHeight:1.7,color:'#a9afb5'}}>
            {integrityIssues === 0
              ? 'ICA-000 — No tenant-integrity problems detected.'
              : 'ICA-201 — Cross-tenant data relationship detected. Review affected records before customer changes are made.'}
          </p>
          {accountStatus === 'warn' && <p style={{fontSize:13,lineHeight:1.7,color:'#e7c36b'}}>ICA-110 — Organization account is not currently active.</p>}
          {suspendedMemberships > 0 && <p style={{fontSize:13,lineHeight:1.7,color:'#e7c36b'}}>ICA-120 — One or more organization memberships are suspended.</p>}
          <p style={{fontSize:11,lineHeight:1.7,color:'#717980',marginTop:20}}>This page diagnoses ICA Unified application/database state. DNS, third-party website hosting, email delivery, and external APIs need their own integration checks when those services are connected.</p>
        </aside>
      </section>
    </main>
  );
}
