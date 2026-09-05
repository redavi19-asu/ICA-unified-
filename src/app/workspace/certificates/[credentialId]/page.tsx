import { notFound } from 'next/navigation';
import { requireSession } from '../../../../lib/auth';
import { prisma } from '../../../../lib/prisma';
import styles from '../../learning/learning.module.css';

export default async function CertificatePage(props: { params: Promise<{ credentialId: string }> }) {
  const params = await props.params;
  const { membership } = await requireSession();

  const credential = await prisma.credential.findFirst({
    where: { id: params.credentialId, organizationId: membership.organizationId },
    include: {
      user: { select: { name: true } },
      enrollment: { include: { course: { select: { title: true, passingScore: true } } } },
      organization: { select: { name: true } },
    },
  });

  if (!credential || !credential.enrollment) notFound();

  return (
    <main className={styles.shell}>
      <a className={styles.back} href={`/workspace/learning/${credential.enrollment.courseId}`}>← COURSE</a>
      <section className={styles.certificate}>
        <p className={styles.eyebrow}>ICA UNIFIED / VERIFIED TRAINING RECORD</p>
        <h1>CERTIFICATE<br />OF COMPLETION</h1>
        <p>This certifies that</p>
        <div className={styles.certificateName}>{credential.user.name}</div>
        <p>successfully completed</p>
        <div className={styles.certificateCourse}>{credential.enrollment.course.title}</div>
        <div className={styles.certificateMeta}>
          <div><span>ORGANIZATION</span><strong>{credential.organization.name}</strong></div>
          <div><span>ISSUED</span><strong>{credential.issuedAt?.toLocaleDateString() ?? '—'}</strong></div>
          <div><span>VALID THROUGH</span><strong>{credential.expiresAt?.toLocaleDateString() ?? 'No expiration'}</strong></div>
          <div><span>SCORE</span><strong>{credential.enrollment.score ?? '—'}%</strong></div>
          <div><span>PASSING SCORE</span><strong>{credential.enrollment.course.passingScore}%</strong></div>
          <div><span>VERIFICATION CODE</span><strong>{credential.code ?? credential.id.slice(0, 12).toUpperCase()}</strong></div>
        </div>
      </section>
    </main>
  );
}
