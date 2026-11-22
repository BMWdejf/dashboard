import { z } from 'zod';

/**
 * Pre-flight checks for a new integration (dashboard /integrations/new/*):
 * the user types connection details, the API runs these checks and returns
 * steps the page shows in its "diagnostic" card. Nothing is saved.
 *
 * Steps carry a `code` (+ `params`) instead of text, so the web app can show
 * them in the user's language.
 */
export type CheckStatus = 'ok' | 'warn' | 'failed' | 'skipped';

export interface CheckStep {
  key: string;
  status: CheckStatus;
  code: string;
  params?: Record<string, string | number>;
}

export interface CheckResult<Info = undefined> {
  /** Every step ok or warn. */
  ok: boolean;
  steps: CheckStep[];
  /** Round trip of the main request, ms. */
  latencyMs: number | null;
  info: Info | null;
}

/** Network seams, replaced in tests. */
export interface CheckDeps {
  fetch: typeof fetch;
  /** All addresses of a host name (like dns.promises.lookup with all: true). */
  lookup: (host: string) => Promise<string[]>;
  now?: () => number;
  timeoutMs?: number;
  /**
   * Flexi only: private networks are allowed (FLEXI_CHECK_ALLOW_PRIVATE).
   * `fetch` must then be pinned with the same rule (see guardedLookup).
   */
  allowPrivate?: boolean;
}

const HOST = /^(?=.{1,253}$)[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/i;
const IPV6 = /^\[?[0-9a-f:.]+\]?$/i;

export const flexiCheckInput = z.object({
  /** Host name or IP, without scheme or path. */
  host: z
    .string()
    .trim()
    .toLowerCase()
    .refine((h) => HOST.test(h) || IPV6.test(h), 'Invalid host name.'),
  port: z.coerce.number().int().min(1).max(65535),
  user: z.string().trim().min(1).max(100),
  password: z.string().min(1).max(200),
});
export type FlexiCheckInput = z.infer<typeof flexiCheckInput>;

export const shoptetCheckInput = z.object({
  token: z
    .string()
    .trim()
    .min(10)
    .max(300)
    .regex(/^\S+$/, 'The token has no spaces.'),
});
export type ShoptetCheckInput = z.infer<typeof shoptetCheckInput>;

export const feedCheckInput = z.object({
  url: z
    .string()
    .trim()
    .max(2000)
    .pipe(z.url({ protocol: /^https?$/ })),
});
export type FeedCheckInput = z.infer<typeof feedCheckInput>;

export interface FlexiCheckInfo {
  url: string;
  companies: { dbNazev: string; nazev: string }[];
}

export interface ShoptetCheckInfo {
  name: string | null;
  url: string | null;
}

export type FeedDialect = 'zbozi' | 'shopitem' | 'google' | 'mergado' | 'custom';

export interface FeedCheckInfo {
  dialect: FeedDialect;
  root: string;
  itemElement: string | null;
  items: number;
  bytes: number;
  parseMs: number;
  encoding: string;
}
