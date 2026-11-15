import { getDb } from './client';

/** True when the database answers a trivial query. Never throws. */
export async function pingDb(): Promise<boolean> {
  try {
    await getDb().$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}
