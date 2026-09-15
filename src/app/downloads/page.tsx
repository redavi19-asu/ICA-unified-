import { redirect } from 'next/navigation';
import { requireSession } from '../../lib/auth';
import { ensureBillingProfile } from '../../lib/organization-ops';
import { isStripeCheckoutConfigured, isStripeEntitledStatus } from '../../lib/stripe-billing';
import styles from './downloads.module.css';

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
  ) redirect('/setup/billing');

  const windowsUrl = (process.env.ICA_WINDOWS_DOWNLOAD_URL || '').trim();
  const macUrl = (process.env.ICA_MAC_DOWNLOAD_URL || '').trim();
  const subscriptionLabel = String(billing?.subscriptionStatus || membership.organization.status).toUpperCase();

  return (
    <main className={styles.shell}>
      <header className={styles.nav}>
        <a href="/" className={styles.brand}>ICA <span>UNIFIED</span></a>
        <div><a href="/workspace">Workspace</a><a href="/workspace/billing">Billing</a><a href="/login">Customer Login</a></div>
      </header>

      <section className={styles.hero}>
        <p className={styles.eyebrow}>{params.welcome ? 'TRIAL ACTIVATED / STEP 3 OF 3' : 'ICA UNIFIED / ACCESS CENTER'}</p>
        <h1>{params.welcome ? <>You&apos;re in.<br/>Choose where you work.</> : <>One company.<br/>Every screen.</>}</h1>
        <p>
          Your ICA Unified subscription belongs to the organization—not one computer.
          Authorized users can work in the browser and supported ICA apps using the same company identity and cloud record.
        </p>
        <span className={styles.status}>SUBSCRIPTION · {subscriptionLabel}</span>
      </section>

      <section className={styles.grid}>
        <AppCard platform="WEB" title="ICA Unified Web" copy="The complete organization workspace. Nothing to install—open it from any supported modern browser." href="/workspace" action="OPEN WEB APP" state="READY" />
        <AppCard platform="WINDOWS" title="ICA Unified for Windows" copy="A dedicated Windows desktop client connected to the same ICA Unified organization and data." href={windowsUrl} action="DOWNLOAD WINDOWS" state={windowsUrl ? 'READY' : 'PACKAGING'} />
        <AppCard platform="macOS" title="ICA Unified for Mac" copy="A dedicated macOS desktop client for Apple Silicon and supported Intel Macs." href={macUrl} action="DOWNLOAD MAC" state={macUrl ? 'READY' : 'PACKAGING'} />
        <AppCard platform="IPHONE + IPAD" title="ICA Unified Mobile" copy="Event-floor companion for QR check-in, member lookup, attendance, CE, credentials, and notifications." href="" action="APP STORE" state="IN DEVELOPMENT" />
      </section>

      <section className={styles.sameAccount}>
        <div><span>ONE ORGANIZATION</span><strong>{membership.organization.name}</strong></div>
        <div><span>ONE LOGIN</span><strong>{membership.user.email}</strong></div>
        <div><span>ONE CLOUD RECORD</span><strong>WEB ↔ DESKTOP ↔ MOBILE</strong></div>
      </section>

      <p className={styles.fine}>
        Desktop download buttons become active only when signed production installers are published. This prevents customers from receiving unsigned or unverified software.
      </p>
    </main>
  );
}

function AppCard({platform,title,copy,href,action,state}:{platform:string;title:string;copy:string;href:string;action:string;state:string}) {
  const ready=state==='READY';
  return (
    <article className={ready ? styles.cardReady : styles.card}>
      <div className={styles.cardTop}><span>{platform}</span><b>{state}</b></div>
      <div className={styles.deviceMark}>{platform === 'WEB' ? '◫' : platform === 'WINDOWS' ? '⊞' : platform === 'macOS' ? '◉' : '▯'}</div>
      <h2>{title}</h2>
      <p>{copy}</p>
      {ready ? <a href={href}>{action} →</a> : <span className={styles.disabled}>{state}</span>}
    </article>
  );
}
