import { z } from 'zod';

export { z };

export class EnvError extends Error {
  constructor(public readonly issues: string[]) {
    super(`Invalid environment:\n${issues.map((i) => `  - ${i}`).join('\n')}`);
    this.name = 'EnvError';
  }
}

/**
 * Parse environment variables against a zod schema. Fails fast with every
 * problem listed, so a misconfigured app or worker never starts half-working.
 */
export function loadEnv<S extends z.ZodType>(
  schema: S,
  env: Record<string, string | undefined> = process.env,
): z.infer<S> {
  const result = schema.safeParse(env);
  if (!result.success) {
    throw new EnvError(
      result.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`),
    );
  }
  return result.data;
}

/** Shoptet: private API token for our own e-shop, and the webhook signature key. */
export const shoptetEnv = z.object({
  SHOPTET_API_URL: z.url().default('https://api.myshoptet.com'),
  SHOPTET_PRIVATE_API_TOKEN: z.string().min(1),
  SHOPTET_WEBHOOK_SIGNATURE_KEY: z.string().min(1).optional(),
});
export type ShoptetEnv = z.infer<typeof shoptetEnv>;

/** ABRA Flexi: server URL (with port), company id and an API user. */
export const flexiEnv = z.object({
  FLEXI_URL: z.url(),
  FLEXI_COMPANY: z.string().min(1),
  FLEXI_USER: z.string().min(1),
  FLEXI_PASSWORD: z.string().min(1),
  /** Writes go through ?dry-run=true unless this is explicitly "false". */
  FLEXI_DRY_RUN: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
});
export type FlexiEnv = z.infer<typeof flexiEnv>;

export const scraperEnv = z.object({
  SCRAPER_USER_AGENT: z.string().min(1).default('dashboard-scraper/0.1'),
  SCRAPER_MIN_DELAY_MS: z.coerce.number().int().min(0).default(2000),
});
export type ScraperEnv = z.infer<typeof scraperEnv>;

/** Neon Auth (managed Better Auth) for the web app. */
export const authEnv = z.object({
  NEON_AUTH_BASE_URL: z.url(),
  /** Signs the cached session cookie; at least 32 characters. */
  NEON_AUTH_COOKIE_SECRET: z.string().min(32),
});
export type AuthEnv = z.infer<typeof authEnv>;

/**
 * Flexi → Neon sync API (apps/api /sync/flexi). Without a token the endpoints
 * answer 503, so the sync can't be started by anyone by accident.
 */
export const syncEnv = z.object({
  /** Bearer token for POST /sync/flexi and GET /sync/flexi/cron; at least 32 characters. */
  SYNC_API_TOKEN: z.string().min(32).optional(),
});
export type SyncEnv = z.infer<typeof syncEnv>;

/**
 * The web app's server side calling our API (apps/api) for anything that talks
 * to Flexi: product edits and on-demand syncs.
 */
export const apiEnv = z.object({
  API_URL: z.url().default('http://localhost:3000'),
  SYNC_API_TOKEN: z.string().min(32).optional(),
});
export type ApiEnv = z.infer<typeof apiEnv>;

/**
 * Pre-flight checks of new integrations (apps/api /integrations/checks).
 * A Flexi check may reach private networks (a self-hosted server on the LAN)
 * only when this is explicitly "true"; otherwise any signed-in user could use
 * it to probe the API host's network.
 */
export const integrationChecksEnv = z.object({
  FLEXI_CHECK_ALLOW_PRIVATE: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
});
export type IntegrationChecksEnv = z.infer<typeof integrationChecksEnv>;

/**
 * Supplier XML feeds: the API process imports due feeds every minute unless
 * this is "false" (e.g. when a cron calls GET /supplier-feeds/cron instead).
 */
export const supplierFeedEnv = z.object({
  SUPPLIER_FEED_SCHEDULER: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
});
export type SupplierFeedEnv = z.infer<typeof supplierFeedEnv>;

/** HTTP server of apps/api. Hosts such as Render set PORT; locally it is 3000. */
export const serverEnv = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
});
export type ServerEnv = z.infer<typeof serverEnv>;

/** Neon Postgres (`dashboard` database). Runtime uses the pooled URL. */
export const dbEnv = z.object({
  DATABASE_URL: z.url(),
});
export type DbEnv = z.infer<typeof dbEnv>;
