import { requireSession } from '../../../lib/auth';
import { prisma } from '../../../lib/prisma';
import AccountPrivacyClient from './AccountPrivacyClient';

export default async function AccountPrivacyPage() {
  const { membership } = await requireSession({ allowUnentitled: true });
  return (
    <AccountPrivacyClient
      membershipCount={await prisma.membership.count({ where: { userId: membership.userId } })}
      organizationName={membership.organization.name}
      role={membership.role}
      userName={membership.user.name}
      email={membership.user.email}
    />
  );
}
