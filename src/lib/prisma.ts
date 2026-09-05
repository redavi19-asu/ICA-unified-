import { cache } from 'react';
import { PrismaClient } from '@prisma/client';
import { PrismaD1 } from '@prisma/adapter-d1';
import { getCloudflareContext } from '@opennextjs/cloudflare';

export const getPrisma = cache(() => {
  const { env } = getCloudflareContext();
  const adapter = new PrismaD1((env as any).DB);
  return new PrismaClient({ adapter });
});

export const prisma = new Proxy({} as PrismaClient, {
  get(_target, property) {
    const db = getPrisma();
    const value = db[property as keyof PrismaClient];
    return typeof value === 'function' ? value.bind(db) : value;
  },
});
