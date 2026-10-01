import { requireSession } from '../../../lib/auth';
import AccountPrivacyClient from './AccountPrivacyClient';

export default async function AccountPrivacyPage() {
  const { membership } = await requireSession({ allowUnentitled: true });
  return (
    <AccountPrivacyClient
      organizationName={membership.organization.name}
      role={membership.role}
      userName={membership.user.name}
      email={membership.user.email}
    />
  );
}
