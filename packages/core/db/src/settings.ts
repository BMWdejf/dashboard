/**
 * User settings beyond the theme: UI language, which price the product list
 * shows, and Settings → Products (KPI cards and their trends). Pure; safe to
 * import in client components through `@repo/core-db/settings`.
 */
import { z } from 'zod';

// --- Language ---------------------------------------------------------------

/** UI languages. Add a code here and a dictionary in apps/web/lib/i18n. */
export const LOCALES = ['cs', 'en'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'cs';

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

export function parseLocale(value: unknown): Locale {
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

// --- Price shown in lists ---------------------------------------------------

export const PRICE_MODES = ['withVat', 'withoutVat'] as const;
export type PriceMode = (typeof PRICE_MODES)[number];
export const DEFAULT_PRICE_MODE: PriceMode = 'withVat';

export function isPriceMode(value: unknown): value is PriceMode {
  return typeof value === 'string' && (PRICE_MODES as readonly string[]).includes(value);
}

export function parsePriceMode(value: unknown): PriceMode {
  return isPriceMode(value) ? value : DEFAULT_PRICE_MODE;
}

// --- Settings → Products ----------------------------------------------------

/** What the KPI trend compares with: the same moment one day/week/… ago. */
export const COMPARE_PERIODS = ['day', 'week', 'month', 'quarter', 'year'] as const;
export type ComparePeriod = (typeof COMPARE_PERIODS)[number];

/** Trend as a percentage (+12.4 %) or as a count (+31). */
export const TREND_FORMATS = ['percent', 'absolute'] as const;
export type TrendFormat = (typeof TREND_FORMATS)[number];

/**
 * When a product is "low on stock": below the minimum stock set on its stock
 * cards in Flexi (minMJ), or below a fixed quantity set here.
 */
export const LOW_STOCK_MODES = ['flexiMin', 'threshold'] as const;
export type LowStockMode = (typeof LOW_STOCK_MODES)[number];

export const productSettingsSchema = z.object({
  /** Show the trend (vs. previous period) on the KPI cards. */
  showTrends: z.boolean().catch(true),
  comparePeriod: z.enum(COMPARE_PERIODS).catch('month'),
  trendFormat: z.enum(TREND_FORMATS).catch('percent'),
  lowStockMode: z.enum(LOW_STOCK_MODES).catch('flexiMin'),
  /** Used when lowStockMode = threshold. */
  lowStockThreshold: z.number().int().min(1).max(1_000_000).catch(5),
  /** Count non-stock items (services, fees) in "Total products". */
  includeServices: z.boolean().catch(false),
  /** KPIs only for products exported to the e-shop (Flexi exportNaEshop). */
  eshopOnly: z.boolean().catch(false),
});
export type ProductSettings = z.infer<typeof productSettingsSchema>;

/** Strict version for validating what a user submits (no silent fallbacks). */
export const productSettingsInput = z
  .object({
    showTrends: z.boolean(),
    comparePeriod: z.enum(COMPARE_PERIODS),
    trendFormat: z.enum(TREND_FORMATS),
    lowStockMode: z.enum(LOW_STOCK_MODES),
    lowStockThreshold: z.number().int().min(1).max(1_000_000),
    includeServices: z.boolean(),
    eshopOnly: z.boolean(),
  })
  .strict();

export const DEFAULT_PRODUCT_SETTINGS: ProductSettings = productSettingsSchema.parse({});

/** Stored JSON (possibly old or partial) → complete settings; bad fields fall back to defaults. */
export function parseProductSettings(value: unknown): ProductSettings {
  const obj = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return productSettingsSchema.parse(obj);
}

/** The moment a trend compares with. */
export function compareDate(now: Date, period: ComparePeriod): Date {
  const d = new Date(now);
  switch (period) {
    case 'day':
      d.setUTCDate(d.getUTCDate() - 1);
      break;
    case 'week':
      d.setUTCDate(d.getUTCDate() - 7);
      break;
    case 'month':
      d.setUTCMonth(d.getUTCMonth() - 1);
      break;
    case 'quarter':
      d.setUTCMonth(d.getUTCMonth() - 3);
      break;
    case 'year':
      d.setUTCFullYear(d.getUTCFullYear() - 1);
      break;
  }
  return d;
}

/**
 * Trend of a KPI: percent change or absolute difference. null when there is
 * nothing to compare with (no history yet, or percent from zero).
 */
export function trend(current: number, previous: number | null, format: TrendFormat): number | null {
  if (previous === null) return null;
  if (format === 'absolute') return current - previous;
  if (previous === 0) return null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}
