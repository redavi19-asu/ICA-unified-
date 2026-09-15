import { redirect } from 'next/navigation';
import { requireSession } from '../../lib/auth';
import { ensureBillingProfile } from '../../lib/organization-ops';
import { isStripeCheckoutConfigured, isStripeEntitledStatus } from '../../lib/stripe-billing';

export default async function DownloadsPage({
  searchParams,
}: {
  searchParams: Promise<{ welcome?: string }>;
}) {
  const { membership } = await requireSession();
  const params = await searchParams;
  const billing = await ensureBillingProfile(membership.organizationId);

  if (
    isStripeCheckoutConfigured() &&
    membership.organization.plan !== 'internal' &&
    membership.organization.slug !== 'ica-master' &&
    !isStripeEntitledStatus(billing?.subscriptionStatus || '')
  ) {
    redirect('/setup/billing');
  }

  const windowsUrl = (process.env.ICA_WINDOWS_DOWNLOAD_URL || '').trim();
  const macUrl = (process.env.ICA_MAC_DOWNLOAD_URL || '').trim();

  return (
    <main style={shell}>
      <a href="/workspace" style={back}>← ICA UNIFIED</a>
      <header style={header}>
        <p style={eyebrow}>ICA UNIFIED / GET THE APPS</p>
        <h1 style={title}>{params.welcome ? 'Trial activated.' : 'ICA Unified everywhere.'}</h1>
        <p style={copy}>
          One organization account powers the browser and desktop clients. Install ICA Unified where your team works and sign in with the same company credentials.
        </p>
        <div style={status}>SUBSCRIPTION · {String(billing?.subscriptionStatus || membership.organization.status).toUpperCase()}</div>
      </header>

      <section style={grid}>
        <AppCard
          platform="WEB"
          title="Open ICA Unified"
          copy="No installation. Open the full organization workspace in your browser."
          href="/workspace"
          action="OPEN WEB APP"
          ready
        />
        <AppCard
          platform="WINDOWS"
          title="ICA Unified for Windows"
          copy="Desktop client connected to the same ICA Unified cloud workspace."
          href={windowsUrl}
          action="DOWNLOAD WINDOWS"
          ready={Boolean(windowsUrl)}
        />
        <AppCard
          platform="macOS"
          title="ICA Unified for Mac"
          copy="Desktop client for Intel and Apple Silicon Macs, using the same organization data."
          href={macUrl}
          action="DOWNLOAD MAC"
          ready={Boolean(macUrl)}
        />
      </section>

      <p style={fine}>The subscription belongs to the organization, not a single computer. Authorized users can use ICA Unified across supported devices with their organization login.</p>
    </main>
  );
}

function AppCard({
  platform,title,copy,href,action,ready,
}: {
  platform:string;title:string;copy:string;href:string;action:string;ready:boolean;
}) {
  return (
    <article style={card}>
      <span style={eyebrow}>{platform}</span>
      <h2 style={{fontSize:28,margin:'12px 0'}}>{title}</h2>
      <p style={{...copyStyle,minHeight:66}}>{copy}</p>
      {ready ? (
        <a href={href} style={actionButton}>{action} →</a>
      ) : (
        <span style={pendingButton}>INSTALLER BUILD PENDING</span>
      )}
    </article>
  );
}

const shell:React.CSSProperties={minHeight:'100vh',background:'#07101a',color:'#edf6ff',padding:'clamp(24px,6vw,76px)',fontFamily:'Arial,sans-serif'};
const back:React.CSSProperties={color:'#75bfff',textDecoration:'none',fontSize:10,letterSpacing:'.13em'};
const header:React.CSSProperties={maxWidth:900,marginTop:46};
const eyebrow:React.CSSProperties={fontSize:9,letterSpacing:'.16em',color:'#5eb8ff',fontWeight:900};
const title:React.CSSProperties={fontSize:'clamp(44px,7vw,86px)',letterSpacing:'-.06em',lineHeight:.9,margin:'13px 0 22px'};
const copy:React.CSSProperties={color:'#93a8b8',fontSize:17,lineHeight:1.7,maxWidth:760};
const copyStyle:React.CSSProperties={color:'#879cab',fontSize:13,lineHeight:1.65};
const status:React.CSSProperties={display:'inline-block',marginTop:12,border:'1px solid #24435d',padding:'9px 12px',fontSize:9,letterSpacing:'.12em',color:'#7fd2ff'};
const grid:React.CSSProperties={display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(260px,1fr))',gap:14,marginTop:50,maxWidth:1200};
const card:React.CSSProperties={border:'1px solid #20384d',background:'linear-gradient(145deg,#0a1926,#07111a)',padding:28,minHeight:270,display:'flex',flexDirection:'column'};
const actionButton:React.CSSProperties={marginTop:'auto',minHeight:48,display:'flex',alignItems:'center',justifyContent:'center',background:'#178cff',color:'#fff',textDecoration:'none',borderRadius:6,fontSize:10,fontWeight:900,letterSpacing:'.08em'};
const pendingButton:React.CSSProperties={...actionButton,background:'#152737',color:'#668298'};
const fine:React.CSSProperties={maxWidth:900,color:'#667e90',fontSize:11,lineHeight:1.6,marginTop:24};
