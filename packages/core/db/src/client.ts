import { PrismaNeon } from '@prisma/adapter-neon';
import { dbEnv, loadEnv } from '@repo/core-config';

import { PrismaClient } from './generated/prisma/client';

let instance: PrismaClient | undefined;

/**
 * The one Prisma client, created on first use (so builds work without a
 * database). Connects through Neon's serverless driver with the pooled
 * DATABASE_URL.
 */
export function getDb(): PrismaClient {
  if (!instance) {
    const { DATABASE_URL } = loadEnv(dbEnv);
    instance = new PrismaClient({ adapter: new PrismaNeon({ connectionString: DATABASE_URL }) });
  }
  return instance;
}
