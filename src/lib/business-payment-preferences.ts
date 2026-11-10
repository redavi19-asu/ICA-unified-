import { prisma } from './prisma';
import { getPayPalMerchantStatus, paypalPartnerConfig } from './paypal-connect';
import { paypalCheckoutEnabled } from './paypal-workflow-checkout';
import { getSquareMerchantStatus, listSquareMerchantLocations, squareCheckoutEnabled, squareConfig } from './square-connect';
import { getOrganizationPaymentAccount, refreshOrganizationPaymentAccount, stripeConnectConfigured } from './member-payments';

/**
 * ICA subscription billing must NEVER read or modify this preference.
 * Only dues/event collections use the organization's selected checkout provider.
 */
export type ActiveBusinessCheckoutProvider = 'STRIPE' | 'SQUARE' | 'PAYPAL';
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
  return rows[0]?.provider === 'PAYPAL' ? 'PAYPAL' : rows[0]?.provider === 'SQUARE' ? 'SQUARE' : 'STRIPE';
}

export async function businessCheckoutReady(organizationId: string, provider: ActiveBusinessCheckoutProvider): Promise<boolean> {
  if (provider === 'STRIPE') {
    if (!stripeConnectConfigured()) return false;
    const account = await getOrganizationPaymentAccount(organizationId);
    return Boolean(account?.connectedAccountId && account.chargesEnabled && account.payoutsEnabled);
  }
  if (provider === 'PAYPAL') {
    if (!paypalCheckoutEnabled()) return false;
    const merchant = await getPayPalMerchantStatus(organizationId);
    return merchant.connectionStatus === 'CONNECTED' && merchant.environment === paypalPartnerConfig().environment;
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
  // Inspect the actual merchant connection before switching the business.
  // Stale cached "connected" flags should never strand buyers in checkout.
  if (provider === 'STRIPE') {
    await refreshOrganizationPaymentAccount(organizationId);
  } else if (provider === 'SQUARE') {
    const merchant = await getSquareMerchantStatus(organizationId);
    const locations = merchant ? await listSquareMerchantLocations(organizationId) : [];
    if (!merchant?.locationId || !locations.some((item) => item.id === merchant.locationId)) {
      throw new Error('BUSINESS_CHECKOUT_MERCHANT_LOCATION_UNAVAILABLE');
    }
  } else {
    const merchant = await getPayPalMerchantStatus(organizationId);
    if (merchant.connectionStatus !== 'CONNECTED') {
      throw new Error('BUSINESS_CHECKOUT_PAYPAL_NOT_APPROVED');
    }
  }
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
