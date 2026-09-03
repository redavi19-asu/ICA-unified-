import { requireSession } from '../../../lib/auth';
import { prisma } from '../../../lib/prisma';
import styles from './reports.module.css';
import PrintReportButton from './PrintReportButton';

export default async function ReportsPage() {
  const { membership } = await requireSession();
  const organizationId = membership.organizationId;

  const [memberships, enrollments, credentials, documents] = await Promise.all([
    prisma.membership.findMany({
      where: { organizationId },
      include: { user: { select: { name: true, email: true } } },
      orderBy: { joinedAt: 'desc' },
    }),
    prisma.enrollment.findMany({
      where: { organizationId },
      include: { user: { select: { name: true } }, course: { select: { title: true } } },
      orderBy: [{ status: 'asc' }, { dueAt: 'asc' }],
    }),
    prisma.credential.findMany({
      where: { organizationId },
      include: { user: { select: { name: true } } },
      orderBy: { expiresAt: 'asc' },
    }),
    prisma.document.findMany({
      where: { organizationId },
      include: { acknowledgments: { select: { acknowledgedAt: true } } },
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  const now = new Date();
  const completed = enrollments.filter((item) => item.status === 'COMPLETE').length;
  const overdue = enrollments.filter((item) => item.status !== 'COMPLETE' && item.dueAt && item.dueAt < now).length;
  const expiringSoon = credentials.filter((item) => item.expiresAt && item.expiresAt >= now && item.expiresAt <= new Date(now.getTime() + 30 * 86400000)).length;
  const pendingAcknowledgments = documents.reduce((total, document) => {
    if (!document.requiresAck) return total;
    return total + Math.max(0, memberships.length - document.acknowledgments.filter((ack) => ack.acknowledgedAt).length);
  }, 0);

  const completionRate = enrollments.length ? Math.round((completed / enrollments.length) * 100) : 100;

  return (
    <main className={styles.shell}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>{membership.organization.name.toUpperCase()} / REPORT FIELD</p>
          <h1>COMPLIANCE<br />SNAPSHOT</h1>
          <p className={styles.sub}>A print-ready operational report generated from this organization only.</p>
        </div>
        <div className={styles.actions}>
          <a href="/workspace">← WORKSPACE</a>
          <PrintReportButton />
        </div>
      </header>

      <section className={styles.metrics}>
        <Metric label="PEOPLE" value={memberships.length} />
        <Metric label="TRAINING COMPLETE" value={`${completionRate}%`} />
        <Metric label="OVERDUE" value={overdue} />
        <Metric label="EXPIRING / 30 DAYS" value={expiringSoon} />
        <Metric label="ACKNOWLEDGMENTS DUE" value={pendingAcknowledgments} />
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}><p className={styles.eyebrow}>TRAINING STATUS</p><span>{enrollments.length} assignments</span></div>
        <div className={styles.table}>
          {enrollments.length === 0 ? <p className={styles.empty}>No training assignments yet.</p> : enrollments.map((item) => (
            <div className={styles.row} key={item.id}>
              <div><strong>{item.user.name}</strong><span>{item.course.title}</span></div>
              <div><small>STATUS</small><b>{item.status.replaceAll('_', ' ')}</b></div>
              <div><small>PROGRESS</small><b>{item.progress}%</b></div>
              <div><small>DUE</small><b>{item.dueAt?.toLocaleDateString() ?? '—'}</b></div>
            </div>
          ))}
        </div>
      </section>

      <section className={styles.split}>
        <div className={styles.section}>
          <div className={styles.sectionHead}><p className={styles.eyebrow}>CREDENTIAL WATCH</p><span>{credentials.length} records</span></div>
          {credentials.length === 0 ? <p className={styles.empty}>No credentials issued yet.</p> : credentials.slice(0, 12).map((item) => (
            <div className={styles.miniRow} key={item.id}><div><strong>{item.user.name}</strong><span>{item.name}</span></div><b>{item.expiresAt?.toLocaleDateString() ?? 'NO EXPIRATION'}</b></div>
          ))}
        </div>

        <div className={styles.section}>
          <div className={styles.sectionHead}><p className={styles.eyebrow}>DOCUMENT CONTROL</p><span>{documents.length} documents</span></div>
          {documents.length === 0 ? <p className={styles.empty}>No controlled documents yet.</p> : documents.slice(0, 12).map((item) => {
            const acknowledged = item.acknowledgments.filter((ack) => ack.acknowledgedAt).length;
            return <div className={styles.miniRow} key={item.id}><div><strong>{item.title}</strong><span>Version {item.version}</span></div><b>{item.requiresAck ? `${acknowledged}/${memberships.length} ACK` : 'REFERENCE'}</b></div>;
          })}
        </div>
      </section>

      <footer className={styles.footer}>Generated {now.toLocaleString()} · ICA Unified · {membership.organization.name}</footer>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return <div><span>{label}</span><strong>{value}</strong></div>;
}
