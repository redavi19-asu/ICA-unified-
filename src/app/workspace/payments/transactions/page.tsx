import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireSession } from '../../../../lib/auth';
import { prisma } from '../../../../lib/prisma';
import { ensureWorkflowExecutionTables } from '../../../../lib/workflow-execution';
import { listBusinessRefunds, businessRefundsEnabled } from '../../../../lib/business-refunds';
import styles from './transactions.module.css';

type PaidSubmission = {
  id: string; workflowId: string; name: string; email: string;
  paymentStatus: string; amountCents: number; createdAt: string;
};
type Params = { refund?: string };

export default async function BusinessTransactionsPage({
  searchParams,
}: { searchParams: Promise<Params> }) {
  const { membership } = await requireSession();
  if (!['OWNER', 'ADMIN'].includes(membership.role)) redirect('/workspace');
  await ensureWorkflowExecutionTables();

  const transactions = await prisma.$queryRawUnsafe<PaidSubmission[]>(
    "SELECT id, workflowId, name, email, paymentStatus, amountCents, createdAt " +
    "FROM WorkflowSubmission WHERE organizationId = ? AND paymentStatus IN ('PAID', 'REFUNDED') " +
    "ORDER BY datetime(createdAt) DESC LIMIT 80",
    membership.organizationId,
  );
  const refunds = await listBusinessRefunds(membership.organizationId);
  const refundsBySubmission = new Map(refunds.map((refund) => [refund.submissionId, refund]));
  const params = await searchParams;
  const statusMessage: Record<string, string> = {
    disabled: 'Refunds are not yet enabled in this environment. No payment was changed.',
    complete: 'The payment provider confirmed the full refund. Paid access has been cancelled.',
    pending: 'The payment provider is processing the refund. No second refund will be requested.',
    checking: 'The refund request is already being processed. Check its status again shortly.',
    failed: 'The payment provider did not complete the refund. You can retry safely.',
    review: 'We could not verify this refund. No new refund has been confirmed. Check the status before retrying.',
  };
  return (
    <main className={styles.page}>
      <Link href="/workspace/payments" className={styles.back}>← Payment Hub</Link>
      <header>
        <p className={styles.eyebrow}>ICA UNIFIED / BUSINESS CUSTOMER PAYMENTS</p>
        <h1>Payments and refunds</h1>
        <p>Review paid event registrations and membership payments from your business. Full refunds go back through the original payment processor, not through ICA&apos;s software subscription.</p>
      </header>

      {params.refund && statusMessage[params.refund] && (
        <p className={styles.notice} role="status">{statusMessage[params.refund]}</p>
      )}
      {!businessRefundsEnabled() && (
        <p className={styles.notice}>Full refunds are in testing and are currently unavailable through Unified. You can manage existing refunds in your merchant processor&apos;s dashboard.</p>
      )}

      <div className={styles.list}>
        {transactions.map((transaction) => {
          const refund = refundsBySubmission.get(transaction.id);
          const refundable = transaction.paymentStatus === 'PAID' && !refund && businessRefundsEnabled();
          return (
            <article key={transaction.id} className={styles.item}>
              <div className={styles.info}>
                <strong>{transaction.name}</strong>
                <span>{transaction.email}</span>
                <span>Record: {transaction.workflowId}</span>
              </div>
              <div className={styles.actions}>
                <strong>{'$' + (transaction.amountCents / 100).toFixed(2)}</strong>
                <span>{refund ? 'Refund ' + refund.state.replaceAll('_', ' ').toLowerCase()
                  : transaction.paymentStatus === 'REFUNDED' ? 'Refunded' : 'Paid'}</span>
                {refundable && (
                  <details>
                    <summary>Issue a full refund</summary>
                    <form action="/api/payments/refunds" method="post">
                      <p>{'Refund the full $' + (transaction.amountCents / 100).toFixed(2) +
                        ' to the original payment source. This cancels paid access after the provider confirms the refund.'}</p>
                      <input type="hidden" name="action" value="FULL_REFUND" />
                      <input type="hidden" name="workflowId" value={transaction.workflowId} />
                      <input type="hidden" name="submissionId" value={transaction.id} />
                      <label><input type="checkbox" name="confirm" value="FULL_REFUND" required /> I approve this full refund.</label>
                      <button type="submit">Confirm full refund</button>
                    </form>
                  </details>
                )}
                {refund?.state === 'PENDING' && (
                  <form action="/api/payments/refunds" method="post">
                    <input type="hidden" name="action" value="RECHECK" />
                    <input type="hidden" name="workflowId" value={transaction.workflowId} />
                    <input type="hidden" name="submissionId" value={transaction.id} />
                    <button type="submit">Check refund status</button>
                  </form>
                )}
                {refund?.state === 'FAILED' && businessRefundsEnabled() && (
                  <details>
                    <summary>Retry refund safely</summary>
                    <form action="/api/payments/refunds" method="post">
                      <input type="hidden" name="action" value="FULL_REFUND" />
                      <input type="hidden" name="workflowId" value={transaction.workflowId} />
                      <input type="hidden" name="submissionId" value={transaction.id} />
                      <label><input type="checkbox" name="confirm" value="FULL_REFUND" required /> Retry using the same provider idempotency reference.</label>
                      <button type="submit">Retry refund</button>
                    </form>
                  </details>
                )}
              </div>
            </article>
          );
        })}
        {!transactions.length && <p className={styles.empty}>No verified paid membership or event transactions to display.</p>}
      </div>
      <footer><Link href="/workspace/payments">Return to Payment Hub</Link></footer>
    </main>
  );
}
