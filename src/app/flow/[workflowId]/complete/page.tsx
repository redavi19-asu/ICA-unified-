import Link from 'next/link';
import { confirmWorkflowPayment } from '../../../../lib/member-payments';
import styles from '../public-workflow.module.css';

export const dynamic = 'force-dynamic';

export default async function WorkflowPaymentCompletePage({
  params,
  searchParams,
}: {
  params: Promise<{ workflowId: string }>;
  searchParams: Promise<{ session_id?: string; submission?: string }>;
}) {
  const { workflowId } = await params;
  const query = await searchParams;
  const sessionId = String(query.session_id || '');
  const submissionId = String(query.submission || '');

  let state: 'SUCCESS' | 'PROCESSING' | 'ERROR' = 'ERROR';
  let status = '';
  let activationUrl: string | null = null;
  let message = 'ICA could not verify this payment return.';

  if (sessionId && submissionId) {
    try {
      const result = await confirmWorkflowPayment({
        workflowId,
        submissionId,
        sessionId,
        origin: String(process.env.NEXT_PUBLIC_APP_URL || process.env.APP_BASE_URL || '').trim() || 'https://unified.icomputeranything.com',
      });

      if (result.paid) {
        state = 'SUCCESS';
        status = result.status;
        activationUrl = result.activationUrl;
        message = 'Payment verified and your ICA workflow record has been updated.';
      } else {
        state = 'PROCESSING';
        status = result.status;
        message = 'Stripe returned successfully, but payment is still processing. ICA has not granted paid access yet.';
      }
    } catch (error) {
      console.error('ICA_WORKFLOW_PAYMENT_CONFIRM_ERROR', error);
    }
  }

  return (
    <main className={styles.shell}>
      <section className={styles.formCard} style={{maxWidth:680,margin:'80px auto',position:'relative',zIndex:1}}>
        <p className={styles.eyebrow}>ICA UNIFIED / SECURE PAYMENT RETURN</p>
        <h2>{state === 'SUCCESS' ? 'Payment confirmed.' : state === 'PROCESSING' ? 'Payment processing.' : 'Payment verification issue.'}</h2>
        <div className={state === 'SUCCESS' ? styles.success : styles.error}>
          <p>{message}</p>
          {status && <p><strong>Status:</strong> {status.replaceAll('_', ' ')}</p>}
        </div>
        {activationUrl && <a href={activationUrl} style={{display:'inline-block',marginTop:18,fontWeight:900}}>ACTIVATE ICA ACCOUNT →</a>}
        {!activationUrl && <Link href={`/flow/${workflowId}`} style={{display:'inline-block',marginTop:18,fontWeight:900}}>RETURN TO WORKFLOW →</Link>}
      </section>
    </main>
  );
}
