import { requireSession } from '../../../lib/auth';
import { prisma } from '../../../lib/prisma';
import { getMemberComplianceSummary } from '../../../lib/compliance';
import styles from './wallet.module.css';

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
    <main className={styles.shell}>
      <a href="/my" className={styles.back}>← MY WORKSPACE</a>

      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>{membership.organization.name.toUpperCase()} / MEMBER RECORD</p>
          <h1 className={styles.title}>CREDENTIAL<br/>+ CE WALLET</h1>
        </div>
        <div className={styles.memberCard}>
          <p className={styles.eyebrow}>DIGITAL MEMBER CARD</p>
          <strong className={styles.memberName}>{membership.user.name}</strong>
          <span className={styles.muted}>{membership.user.email}</span>
          <span className={styles.memberMeta}>{membership.role} · MEMBER SINCE {membership.joinedAt.getFullYear()}</span>
        </div>
      </header>

      <section className={styles.metrics}>
        <Metric label="CE EARNED" value={summary.earnedTotal.toFixed(1)} />
        <Metric label="CE REQUIRED" value={summary.requiredTotal.toFixed(1)} />
        <Metric label="STILL NEEDED" value={summary.outstandingTotal.toFixed(1)} />
        <Metric label="RENEWAL STATUS" value={summary.requirements.length ? (summary.ready ? 'READY' : 'ACTION') : 'N/A'} />
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}><div><p className={styles.eyebrow}>COMPLIANCE TRACKER</p><h2>Know exactly what is left.</h2></div><p className={styles.copy}>Credits from completed courses and QR event attendance are counted from the same ledger automatically.</p></div>
        {summary.requirements.length === 0 ? <p className={styles.empty}>Your organization has not configured a CE or renewal requirement yet.</p> : summary.requirements.map((item) => {
          const percent = item.requiredCredits > 0 ? Math.min(100, Math.round((item.earnedCredits / item.requiredCredits) * 100)) : 100;
          return (
            <article key={item.id} className={styles.requirement}>
              <div className={styles.requirementTop}><strong>{item.name}</strong><span className={item.met ? styles.ready : styles.needed}>{item.met ? 'READY' : `${item.gap.toFixed(1)} NEEDED`}</span></div>
              <div className={styles.requirementMeta}><span>{item.category} · {item.earnedCredits.toFixed(1)} / {item.requiredCredits.toFixed(1)} credits</span><span>{item.renewalDate ? `Renews ${new Date(item.renewalDate).toLocaleDateString()}` : item.source === 'MEMBERSHIP' ? 'Membership renewal rule' : 'Ongoing requirement'}</span></div>
              <div className={styles.progress}><div style={{width:`${percent}%`}} /></div>
            </article>
          );
        })}
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}><div><p className={styles.eyebrow}>SMART NEXT COURSES</p><h2>Close your remaining gaps.</h2></div><p className={styles.copy}>ICA matches course credit categories to requirements that are not yet satisfied.</p></div>
        {summary.recommendations.length === 0 ? <p className={styles.empty}>{summary.ready ? 'No additional course is needed for the configured requirements.' : 'No matching credit-bearing courses are configured yet.'}</p> : (
          <div className={styles.recommendations}>
            {summary.recommendations.map((item) => (
              <a key={item.courseId} href={`/workspace/learning/${item.courseId}`} className={styles.course}>
                <p className={styles.eyebrow}>{item.category}</p><strong>{item.title}</strong><span>{item.credits} credit{item.credits === 1 ? '' : 's'} →</span>
              </a>
            ))}
          </div>
        )}
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}><div><p className={styles.eyebrow}>CREDENTIAL WALLET</p><h2>Certificates stay with the member.</h2></div><p className={styles.copy}>Every issued credential remains tied to your organization record and can be publicly verified when it has a verification code.</p></div>
        {credentials.length === 0 ? <p className={styles.empty}>No credentials have been issued yet.</p> : credentials.map((item) => (
          <article key={item.id} className={styles.walletRow}>
            <div><strong>{item.name}</strong><span className={styles.rowMeta}>{item.issuedAt ? `Issued ${item.issuedAt.toLocaleDateString()}` : 'Pending issue date'}</span></div>
            <span>{item.expiresAt ? `Expires ${item.expiresAt.toLocaleDateString()}` : 'No expiration'}</span>
            <span>{item.status.toUpperCase()}</span>
            {item.code ? <a href={`/verify/${item.code}`} className={styles.verify}>VERIFY →</a> : <span>—</span>}
          </article>
        ))}
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}><div><p className={styles.eyebrow}>CE TRANSCRIPT</p><h2>One record, every source.</h2></div><p className={styles.copy}>Course completions and event attendance appear together instead of living in separate LMS and AMS histories.</p></div>
        {summary.ledger.length === 0 ? <p className={styles.empty}>No CE credits have been posted yet.</p> : summary.ledger.map((entry) => (
          <article key={entry.id} className={styles.walletRow}>
            <div><strong>{entry.description}</strong><span className={styles.rowMeta}>{entry.sourceType}</span></div>
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
  return <div className={styles.metric}><span className={styles.eyebrow}>{label}</span><strong style={{fontSize:value.length > 6 ? 25 : 40}}>{value}</strong></div>;
}
