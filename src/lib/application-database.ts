import { getCloudflareContext } from "@opennextjs/cloudflare";
import { PrismaD1 } from "@prisma/adapter-d1";
export type ApplicationDatabase = Extract<
  ConstructorParameters<typeof PrismaD1>[0],
  { prepare: unknown }
>;
export function applicationDatabase(): ApplicationDatabase {
  const { env } = getCloudflareContext();
  const db = (env as { DB?: ApplicationDatabase }).DB;
  if (!db) throw new Error("Application database is unavailable.");
  return db;
}
