import { prisma } from './prisma';
import { getSquareMerchantStatus, squareCheckoutEnabled, squareConfig } from './square-connect';
import { getOrganizationPaymentAccount, stripeConnectConfigured } from './member-payments';

/**
 * ICA subscription billing must NEVER read or modify this preference.
 * Only dues/event collections use the organization's selected checkout provider.
 */
export type ActiveBusinessCheckoutProvider = 'STRIPE' | 'SQUARE';
let tableReady: Promise<void> | null = null;

async function ensureTable() {
  if (!tableReady) {
    tableReady = prisma.$executeRawUnsafe(
      "CREATE TABLE IF NOT EXISTS BusinessPaymentPreference (" +
      "organizationId TEXT PRIMARY KEY NOT NULL, provider TEXT NOT NULL DEFAULT 'STRIPE', " +
      "updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"
    ).then(() => undefined).catch((error) => { tableReady = null; throw error; });
  }
  return tableReady;
}

export async function preferredBusinessCheckoutProvider(organizationId: string): Promise<ActiveBusinessCheckoutProvider> {
  await ensureTable();
  const rows = await prisma.$queryRawUnsafe<Array<{ provider: string }>>(
    'SELECT provider FROM BusinessPaymentPreference WHERE organizationId = ? LIMIT 1',
    organizationId
  );
  return rows[0]?.provider === 'SQUARE' ? 'SQUARE' : 'STRIPE';
}

export async function businessCheckoutReady(organizationId: string, provider: ActiveBusinessCheckoutProvider): Promise<boolean> {
  if (provider === 'STRIPE') {
    if (!stripeConnectConfigured()) return false;
    const account = await getOrganizationPaymentAccount(organizationId);
    return Boolean(account?.connectedAccountId && account.chargesEnabled && account.payoutsEnabled);
  }
  if (!squareCheckoutEnabled()) return false;
  const connection = await getSquareMerchantStatus(organizationId);
  return Boolean(
    connection?.status === 'CONNECTED' &&
    connection?.locationId &&
    connection.mode === squareConfig().mode
  );
}

export async function setPreferredBusinessCheckoutProvider(
  organizationId: string,
  provider: ActiveBusinessCheckoutProvider,
) {
  if (!await businessCheckoutReady(organizationId, provider)) {
    throw new Error('BUSINESS_CHECKOUT_PROVIDER_NOT_READY');
  }
  await ensureTable();
  await prisma.$executeRawUnsafe(
    'INSERT INTO BusinessPaymentPreference (organizationId, provider, updatedAt) ' +
    'VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(organizationId) DO UPDATE SET ' +
    'provider=excluded.provider, updatedAt=CURRENT_TIMESTAMP',
    organizationId, provider
  );
}
