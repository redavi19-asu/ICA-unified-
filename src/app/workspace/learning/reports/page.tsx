import { redirect } from 'next/navigation';
import { requireSession } from '../../../../lib/auth';
import { prisma } from '../../../../lib/prisma';
import styles from '../learning.module.css';
import reportStyles from './reports.module.css';

function formatDate(value: Date | null) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(value);
}

export default async function LearningReportsPage() {
  const { membership } = await requireSession();
  if (!['OWNER', 'ADMIN', 'MANAGER'].includes(membership.role)) redirect('/workspace/learning');

  const organizationId = membership.organizationId;
  const now = new Date();
  const expiringWindow = new Date(now);
  expiringWindow.setDate(expiringWindow.getDate() + 60);

  const [enrollments, credentials] = await Promise.all([
    prisma.enrollment.findMany({
      where: { organizationId },
      orderBy: [{ dueAt: 'asc' }, { user: { name: 'asc' } }],
      include: {
        user: { select: { id: true, name: true, email: true } },
        course: { select: { id: true, title: true, required: true, passingScore: true } },
        credential: { select: { id: true, issuedAt: true, expiresAt: true, status: true } },
      },
    }),
    prisma.credential.findMany({
      where: {
        organizationId,
        expiresAt: { gte: now, lte: expiringWindow },
      },
      orderBy: { expiresAt: 'asc' },
      include: { user: { select: { name: true, email: true } } },
    }),
  ]);

  const complete = enrollments.filter((item) => item.status === 'COMPLETE').length;
  const overdue = enrollments.filter((item) => item.status !== 'COMPLETE' && item.dueAt && item.dueAt < now).length;
  const failed = enrollments.filter((item) => item.score !== null && item.score < item.course.passingScore && item.status !== 'COMPLETE').length;
  const active = enrollments.filter((item) => item.status !== 'COMPLETE' && !(item.dueAt && item.dueAt < now)).length;

  return (
    <main className={styles.shell}>
      <header className={styles.header}>
        <div>
          <a className={styles.back} href="/workspace/learning">← LEARNING ENGINE</a>
          <p className={styles.eyebrow}>{membership.organization.name.toUpperCase()} / LMS REPORTING</p>
          <h1>TRAINING<br />REPORTS</h1>
          <p className={styles.intro}>Company-wide completion, overdue training, failed attempts, and certificates nearing expiration.</p>
        </div>
      </header>

      <section className={styles.metrics}>
        <div><span>ASSIGNED</span><strong>{enrollments.length}</strong></div>
        <div><span>COMPLETE</span><strong>{complete}</strong></div>
        <div><span>OVERDUE</span><strong>{overdue}</strong></div>
        <div><span>EXPIRING 60D</span><strong>{credentials.length}</strong></div>
      </section>

      <section className={reportStyles.reportSummary}>
        <div><span>ACTIVE / IN PROGRESS</span><strong>{active}</strong></div>
        <div><span>BELOW PASSING SCORE</span><strong>{failed}</strong></div>
        <div><span>COMPLETION RATE</span><strong>{enrollments.length ? Math.round((complete / enrollments.length) * 100) : 0}%</strong></div>
      </section>

      <section className={reportStyles.reportSection}>
        <div className={reportStyles.reportHeading}>
          <div><p className={styles.eyebrow}>ASSIGNMENT HEALTH</p><h2>Everyone. Every course. One view.</h2></div>
          <p>Overdue rows are flagged automatically from each assignment due date.</p>
        </div>
        <div className={reportStyles.reportTableWrap}>
          <table className={reportStyles.reportTable}>
            <thead><tr><th>Person</th><th>Course</th><th>Status</th><th>Progress</th><th>Score</th><th>Due</th><th>Credential</th></tr></thead>
            <tbody>
              {enrollments.map((item) => {
                const isOverdue = item.status !== 'COMPLETE' && !!item.dueAt && item.dueAt < now;
                return (
                  <tr key={item.id} data-alert={isOverdue ? 'true' : 'false'}>
                    <td><strong>{item.user.name}</strong><small>{item.user.email}</small></td>
                    <td><a href={`/workspace/learning/${item.course.id}`}>{item.course.title}</a>{item.course.required && <small>REQUIRED</small>}</td>
                    <td><span className={reportStyles.statusPill}>{isOverdue ? 'OVERDUE' : item.status.replaceAll('_', ' ')}</span></td>
                    <td>{item.progress}%</td>
                    <td>{item.score === null ? '—' : `${item.score}%`}</td>
                    <td>{formatDate(item.dueAt)}</td>
                    <td>{item.credential ? <a href={`/workspace/certificates/${item.credential.id}`}>VIEW</a> : '—'}</td>
                  </tr>
                );
              })}
              {enrollments.length === 0 && <tr><td colSpan={7}>No training assignments yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section className={reportStyles.reportSection}>
        <div className={reportStyles.reportHeading}>
          <div><p className={styles.eyebrow}>CERTIFICATE WATCH</p><h2>Expiring in the next 60 days.</h2></div>
          <p>Use this list to schedule refresher training before a credential lapses.</p>
        </div>
        <div className={reportStyles.expiryGrid}>
          {credentials.map((credential) => (
            <article key={credential.id}>
              <span>{formatDate(credential.expiresAt)}</span>
              <h3>{credential.name}</h3>
              <p>{credential.user.name}<br />{credential.user.email}</p>
              <a href={`/workspace/certificates/${credential.id}`}>OPEN CREDENTIAL →</a>
            </article>
          ))}
          {credentials.length === 0 && <p className={styles.message}>No credentials expire within the next 60 days.</p>}
        </div>
      </section>
    </main>
  );
}
