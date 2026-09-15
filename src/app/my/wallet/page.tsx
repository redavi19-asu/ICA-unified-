import type { CSSProperties } from 'react';
import { requireSession } from '../../../lib/auth';
import { prisma } from '../../../lib/prisma';
import { getMemberComplianceSummary } from '../../../lib/compliance';

export default async function CredentialWalletPage() {
  const { membership } = await requireSession();
  const organizationId = membership.organizationId;
  const userId = membership.userId;

  const [summary, credentials] = await Promise.all([
    getMemberComplianceSummary(organizationId, userId),
    prisma.credential.findMany({
      where: { organizationId, userId },
      orderBy: [{ expiresAt: 'asc' }, { issuedAt: 'desc' }],
    }),
  ]);

  return (
    <main style={{minHeight:'100vh',background:'#0f1113',color:'#f2efe8',padding:'clamp(22px,5vw,70px)',fontFamily:'Arial,sans-serif'}}>
      <a href="/my" style={{color:'#90979c',textDecoration:'none',fontSize:11,letterSpacing:'.14em'}}>← MY WORKSPACE</a>

      <header style={{display:'grid',gridTemplateColumns:'1.25fr .75fr',gap:30,alignItems:'end',borderBottom:'1px solid #303438',padding:'30px 0 34px'}}>
        <div><p style={eyebrow}>{membership.organization.name.toUpperCase()} / MEMBER RECORD</p><h1 style={{fontSize:'clamp(52px,8vw,104px)',lineHeight:.78,letterSpacing:'-.065em',margin:'14px 0 0'}}>CREDENTIAL<br/>+ CE WALLET</h1></div>
        <div style={{border:'1px solid #353a3e',padding:20,background:'linear-gradient(145deg,#171a1d,#101214)'}}>
          <p style={eyebrow}>DIGITAL MEMBER CARD</p>
          <strong style={{display:'block',fontSize:25,marginTop:14}}>{membership.user.name}</strong>
          <span style={{display:'block',color:'#9da4a8',marginTop:6}}>{membership.user.email}</span>
          <span style={{display:'block',marginTop:20,fontSize:12,letterSpacing:'.1em'}}>{membership.role} · MEMBER SINCE {membership.joinedAt.getFullYear()}</span>
        </div>
      </header>

      <section style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:1,background:'#2c3134',marginTop:28}}>
        <Metric label="CE EARNED" value={summary.earnedTotal.toFixed(1)} />
        <Metric label="CE REQUIRED" value={summary.requiredTotal.toFixed(1)} />
        <Metric label="STILL NEEDED" value={summary.outstandingTotal.toFixed(1)} />
        <Metric label="RENEWAL STATUS" value={summary.requirements.length ? (summary.ready ? 'READY' : 'ACTION') : 'N/A'} />
      </section>

      <section style={section}>
        <div style={sectionHead}><div><p style={eyebrow}>COMPLIANCE TRACKER</p><h2 style={h2}>Know exactly what is left.</h2></div><p style={copy}>Credits from completed courses and QR event attendance are counted from the same ledger automatically.</p></div>
        {summary.requirements.length === 0 ? <p style={empty}>Your organization has not configured a CE or renewal requirement yet.</p> : summary.requirements.map((item) => {
          const percent = item.requiredCredits > 0 ? Math.min(100, Math.round((item.earnedCredits / item.requiredCredits) * 100)) : 100;
          return (
            <article key={item.id} style={{padding:'18px 0',borderBottom:'1px solid #282d30'}}>
              <div style={{display:'flex',justifyContent:'space-between',gap:20,alignItems:'baseline'}}><strong>{item.name}</strong><span style={{color:item.met?'#dfe7dc':'#d7b9a8'}}>{item.met ? 'READY' : `${item.gap.toFixed(1)} NEEDED`}</span></div>
              <div style={{display:'flex',justifyContent:'space-between',gap:20,color:'#8d959a',fontSize:12,marginTop:7}}><span>{item.category} · {item.earnedCredits.toFixed(1)} / {item.requiredCredits.toFixed(1)} credits</span><span>{item.renewalDate ? `Renews ${new Date(item.renewalDate).toLocaleDateString()}` : item.source === 'MEMBERSHIP' ? 'Membership renewal rule' : 'Ongoing requirement'}</span></div>
              <div style={{height:7,background:'#24292c',marginTop:13,overflow:'hidden'}}><div style={{height:'100%',width:`${percent}%`,background:'#e7e3da'}} /></div>
            </article>
          );
        })}
      </section>

      <section style={section}>
        <div style={sectionHead}><div><p style={eyebrow}>SMART NEXT COURSES</p><h2 style={h2}>Close your remaining gaps.</h2></div><p style={copy}>ICA matches course credit categories to requirements that are not yet satisfied.</p></div>
        {summary.recommendations.length === 0 ? <p style={empty}>{summary.ready ? 'No additional course is needed for the configured requirements.' : 'No matching credit-bearing courses are configured yet.'}</p> : (
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(250px,1fr))',gap:12}}>
            {summary.recommendations.map((item) => (
              <a key={item.courseId} href={`/workspace/learning/${item.courseId}`} style={{border:'1px solid #30363a',padding:18,color:'#f2efe8',textDecoration:'none',background:'#15181a'}}>
                <p style={eyebrow}>{item.category}</p><strong style={{display:'block',fontSize:19,marginTop:10}}>{item.title}</strong><span style={{display:'block',color:'#939b9f',marginTop:15}}>{item.credits} credit{item.credits === 1 ? '' : 's'} →</span>
              </a>
            ))}
          </div>
        )}
      </section>

      <section style={section}>
        <div style={sectionHead}><div><p style={eyebrow}>CREDENTIAL WALLET</p><h2 style={h2}>Certificates stay with the member.</h2></div><p style={copy}>Every issued credential remains tied to your organization record and can be publicly verified when it has a verification code.</p></div>
        {credentials.length === 0 ? <p style={empty}>No credentials have been issued yet.</p> : credentials.map((item) => (
          <article key={item.id} style={walletRow}>
            <div><strong>{item.name}</strong><span style={{display:'block',color:'#80888d',fontSize:12,marginTop:6}}>{item.issuedAt ? `Issued ${item.issuedAt.toLocaleDateString()}` : 'Pending issue date'}</span></div>
            <span>{item.expiresAt ? `Expires ${item.expiresAt.toLocaleDateString()}` : 'No expiration'}</span>
            <span>{item.status.toUpperCase()}</span>
            {item.code ? <a href={`/verify/${item.code}`} style={{color:'#f2efe8'}}>VERIFY →</a> : <span>—</span>}
          </article>
        ))}
      </section>

      <section style={section}>
        <div style={sectionHead}><div><p style={eyebrow}>CE TRANSCRIPT</p><h2 style={h2}>One record, every source.</h2></div><p style={copy}>Course completions and event attendance appear together instead of living in separate LMS and AMS histories.</p></div>
        {summary.ledger.length === 0 ? <p style={empty}>No CE credits have been posted yet.</p> : summary.ledger.map((entry) => (
          <article key={entry.id} style={walletRow}>
            <div><strong>{entry.description}</strong><span style={{display:'block',color:'#80888d',fontSize:12,marginTop:6}}>{entry.sourceType}</span></div>
            <span>{entry.category}</span>
            <strong>+{entry.credits.toFixed(1)}</strong>
            <time>{new Date(entry.awardedAt).toLocaleDateString()}</time>
          </article>
        ))}
      </section>
    </main>
  );
}

function Metric({label,value}:{label:string;value:string}) {
  return <div style={{background:'#15181a',padding:20}}><span style={eyebrow}>{label}</span><strong style={{display:'block',fontSize:value.length > 6 ? 25 : 40,marginTop:10}}>{value}</strong></div>;
}

const eyebrow: CSSProperties = {fontSize:10,letterSpacing:'.16em',color:'#7f878c',margin:0};
const section: CSSProperties = {marginTop:58,paddingTop:28,borderTop:'1px solid #303438'};
const sectionHead: CSSProperties = {display:'grid',gridTemplateColumns:'1.2fr .8fr',gap:24,alignItems:'end',marginBottom:22};
const h2: CSSProperties = {fontSize:'clamp(30px,4vw,50px)',letterSpacing:'-.04em',margin:'8px 0 0'};
const copy: CSSProperties = {color:'#8f969b',lineHeight:1.55,margin:0};
const empty: CSSProperties = {color:'#777f84',padding:'18px 0'};
const walletRow: CSSProperties = {display:'grid',gridTemplateColumns:'2fr 1fr .7fr .7fr',gap:14,padding:'17px 0',borderBottom:'1px solid #282d30',alignItems:'center',color:'#aab0b4'};
