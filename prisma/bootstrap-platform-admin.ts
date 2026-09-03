import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const email = process.env.SUPERADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.SUPERADMIN_PASSWORD;
  const name = process.env.SUPERADMIN_NAME?.trim() || 'ICA Unified Super Administrator';

  if (!email || !password || password.length < 12) {
    throw new Error('Set SUPERADMIN_EMAIL and a SUPERADMIN_PASSWORD of at least 12 characters.');
  }

  const passwordHash = await bcrypt.hash(password, 12);
  await prisma.platformAdmin.upsert({
    where: { email },
    update: { name, passwordHash, role: 'SUPER_ADMIN', active: true },
    create: { email, name, passwordHash, role: 'SUPER_ADMIN', active: true },
  });

  console.log(`Platform super administrator ready: ${email}`);
}

main().finally(async () => prisma.$disconnect());
