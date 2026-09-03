import bcrypt from 'bcryptjs';
import { PrismaClient, Role } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash('Demo123!', 12);

  const organization = await prisma.organization.upsert({
    where: { slug: 'ica-demo' },
    update: {},
    create: { name: 'ICA Demo Company', slug: 'ica-demo' },
  });

  const user = await prisma.user.upsert({
    where: { email: 'admin@icaunified.local' },
    update: { passwordHash },
    create: { name: 'Demo Administrator', email: 'admin@icaunified.local', passwordHash },
  });

  await prisma.membership.upsert({
    where: { userId_organizationId: { userId: user.id, organizationId: organization.id } },
    update: { role: Role.OWNER },
    create: { userId: user.id, organizationId: organization.id, role: Role.OWNER },
  });

  await prisma.course.createMany({
    data: [
      { organizationId: organization.id, title: 'Information Security 2026', required: true, durationMin: 28 },
      { organizationId: organization.id, title: 'Safety & Operations', required: true, durationMin: 35 },
      { organizationId: organization.id, title: 'Customer Privacy', required: true, durationMin: 22 },
    ],
  });

  await prisma.activity.create({
    data: { organizationId: organization.id, actorId: user.id, type: 'system', message: 'ICA Unified workspace initialized.' },
  });
}

main().finally(async () => prisma.$disconnect());
