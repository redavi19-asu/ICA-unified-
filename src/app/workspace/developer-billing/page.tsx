import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireSession } from '../../../lib/auth';
import { developerBillingStatus } from '../../../lib/developer-billing';
import DeveloperBillingClient from './DeveloperBillingClient';

export default async function DeveloperBillingPage() {
  const { membership } = await requireSession();
  if (!['OWNER', 'ADMIN'].includes(membership.role)) redirect('/workspace');
  const status = await developerBillingStatus(membership.organizationId);
  return (
    <main style={{ minHeight: '100vh', background: '#07101a', color: '#eef7ff', padding: 'clamp(24px,6vw,72px)' }}>
      <div style={{ maxWidth: 960, margin: '0 auto' }}>
        <Link href="/workspace/integrations" style={{ color: '#63bdff', textDecoration: 'none', fontSize: 13 }}>← BACK TO INTEGRATIONS</Link>
        <p style={{ marginTop: 45, fontSize: 12, color: '#79b7e2', letterSpacing: '.22em', fontWeight: 800 }}>ICA UNIFIED / DEVELOPER OPERATIONS</p>
        <h1 style={{ fontSize: 'clamp(42px,7vw,76px)', fontWeight: 600, letterSpacing: '-.055em', lineHeight: 1.05, margin: '12px 0 18px' }}>Developer API plans</h1>
        <p style={{ maxWidth: 730, color: '#a5bac9', fontSize: 16, lineHeight: 1.65 }}>
          Private organization API credentials, usage visibility, and optional developer subscriptions.
          Existing company membership and professional subscription billing remain separate.
        </p>
        <DeveloperBillingClient initial={status} />
        <p style={{ marginTop: 30, fontSize: 13, color: '#9cb9cf' }}>
          <Link href="/developers" style={{ color: '#63bdff' }}>Read developer API documentation</Link>.
          API secrets are generated in Integrations; this page never displays saved secrets.
        </p>
      </div>
    </main>
  );
}
