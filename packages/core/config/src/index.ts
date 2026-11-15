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
