import Link from 'next/link';
import { requirePlatformAdmin } from '../../../lib/platform-auth';
import { listDeletionRequests } from '../../../lib/account-deletion';
import DeletionReviewClient from './DeletionReviewClient';

export default async function DeletionRequestsPage() {
  await requirePlatformAdmin(['MASTER', 'PLATFORM_ADMIN']);
  const requests = await listDeletionRequests();
  return <main style={{ maxWidth: 1100, margin: 'auto', padding: '32px 20px' }}>
    <Link href="/platform">← Platform</Link>
    <h1>Account deletion requests</h1>
    <p>Review the requested scope, ownership and records before taking action. Customer updates appear in Account &amp; Privacy.</p>
    <DeletionReviewClient requests={requests} />
  </main>;
}
