import { z } from 'zod';

/**
 * Shoptet output of a product: Flexi values, unless the dashboard holds an own
 * value (override) for the field. Pure; tested. Safe for client components via
 * `@repo/core-db/shoptet`.
 */

/** Fields whose Shoptet value can be overridden on the product detail. */
export const SHOPTET_FIELDS = ['title', 'priceGross', 'stock', 'category'] as const;
export type ShoptetField = (typeof SHOPTET_FIELDS)[number];

const DECIMAL = /^-?\d+(\.\d+)?$/;
const decimalString = z
  .string()
  .trim()
  .transform((s) => s.replace(',', '.'))
  .refine((s) => DECIMAL.test(s), 'not a number');

export const shoptetOverridesSchema = z
  .object({
    title: z.string().trim().min(1).max(255),
    priceGross: decimalString.refine((s) => Number(s) >= 0, 'negative'),
    stock: decimalString.refine((s) => Number(s) >= 0, 'negative'),
    category: z.string().trim().min(1).max(255),
  })
  .partial()
  .strict();
export type ShoptetOverrides = z.infer<typeof shoptetOverridesSchema>;

export const shoptetSettingsInput = z
  .object({
    overrides: shoptetOverridesSchema,
    stockAutoSync: z.boolean(),
    safetyBuffer: decimalString.refine((s) => Number(s) >= 0, 'negative'),
  })
  .strict();
export type ShoptetSettingsInput = z.infer<typeof shoptetSettingsInput>;

export interface ShoptetSettings {
  overrides: ShoptetOverrides;
  stockAutoSync: boolean;
  /** Decimal string. */
  safetyBuffer: string;
}

export const DEFAULT_SHOPTET_SETTINGS: ShoptetSettings = {
  overrides: {},
  stockAutoSync: true,
  safetyBuffer: '0',
};

/** Stored JSON → valid overrides; unknown or broken fields are dropped. */
export function parseShoptetOverrides(value: unknown): ShoptetOverrides {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out: ShoptetOverrides = {};
  for (const field of SHOPTET_FIELDS) {
    const r = shoptetOverridesSchema.shape[field].safeParse((value as Record<string, unknown>)[field]);
    if (r.success && r.data !== undefined) (out as Record<string, string>)[field] = r.data;
  }
  return out;
}

/** What Flexi says for each field (decimal strings; null = no value). */
export interface FlexiFieldValues {
  title: string;
  priceGross: string | null;
  /** Available stock (stock − reserved). */
  available: string;
  category: string | null;
}

export interface ShoptetOutputField {
  value: string | null;
  /** The dashboard's own value is used. */
  overridden: boolean;
  /** Overridden with a value different from Flexi's. */
  conflict: boolean;
}

const same = (a: string | null, b: string | null, numeric: boolean) =>
  numeric ? a !== null && b !== null && Number(a) === Number(b) : (a ?? '') === (b ?? '');

/**
 * The value sent to Shoptet per field. Stock without an override is "available −
 * safety buffer" (never below 0) when auto-sync is on, otherwise not sent (null).
 */
export function shoptetOutput(
  flexi: FlexiFieldValues,
  settings: ShoptetSettings,
): Record<ShoptetField, ShoptetOutputField> & { conflicts: number } {
  const o = settings.overrides;
  const auto = Math.max(0, Number(flexi.available) - Number(settings.safetyBuffer));
  const stockFromFlexi = settings.stockAutoSync ? String(Math.round(auto * 1e6) / 1e6) : null;
  const field = (own: string | undefined, fromFlexi: string | null, numeric: boolean): ShoptetOutputField => ({
    value: own ?? fromFlexi,
    overridden: own !== undefined,
    conflict: own !== undefined && !same(own, fromFlexi, numeric),
  });
  const out = {
    title: field(o.title, flexi.title, false),
    priceGross: field(o.priceGross, flexi.priceGross, true),
    stock: field(o.stock, stockFromFlexi, true),
    category: field(o.category, flexi.category, false),
  };
  return { ...out, conflicts: SHOPTET_FIELDS.filter((f) => out[f].conflict).length };
}
