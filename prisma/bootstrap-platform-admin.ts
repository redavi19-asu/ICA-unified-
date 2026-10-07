import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const email = (process.env.PLATFORM_ADMIN_EMAIL || process.env.SUPERADMIN_EMAIL)?.trim().toLowerCase();
  const password = process.env.PLATFORM_ADMIN_PASSWORD || process.env.SUPERADMIN_PASSWORD;
  const name = process.env.PLATFORM_ADMIN_NAME?.trim() || process.env.SUPERADMIN_NAME?.trim() || 'ICA Unified Platform Administrator';

  if (!email || !password || password.length < 12) {
    throw new Error('Set PLATFORM_ADMIN_EMAIL and a PLATFORM_ADMIN_PASSWORD of at least 12 characters.');
  }

  const passwordHash = await bcrypt.hash(password, 12);
  await prisma.platformAdmin.upsert({
    where: { email },
    update: { name, passwordHash, role: 'PLATFORM_ADMIN', active: true },
    create: { email, name, passwordHash, role: 'PLATFORM_ADMIN', active: true },
  });

  console.log(`Platform administrator ready: ${email}`);
}

main().finally(async () => prisma.$disconnect());
