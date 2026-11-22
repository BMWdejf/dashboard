import type { ProductFilter } from './product-filters';
import { trend, type PriceMode, type ProductSettings } from './settings';

/** Pure parts of the Products page (status, paging, KPI maths). Tested. */

export type StockStatus = 'inStock' | 'lowStock' | 'outOfStock' | 'service';

export interface ProductListRow {
  id: string;
  kod: string;
  nazev: string;
  eanKod: string | null;
  skupinaKod: string | null;
  skupinaNazev: string | null;
  /** Price per the user's price mode, as a decimal string. */
  price: string | null;
  stock: string;
  unit: string | null;
  status: StockStatus;
}

export interface ProductListQuery {
  q?: string;
  /** Filters from the URL (parseProductFilters), joined with AND. */
  filters?: readonly ProductFilter[];
  page: number;
  perPage: number;
  priceMode: PriceMode;
  settings: Pick<ProductSettings, 'lowStockMode' | 'lowStockThreshold'>;
  now?: Date;
}

export const PER_PAGE_OPTIONS = [10, 25, 50, 100] as const;

/** Page number clamped to the available pages (1-based). */
export function clampPage(page: number, total: number, perPage: number): number {
  const last = Math.max(1, Math.ceil(total / perPage));
  return Math.min(Math.max(1, Math.floor(page) || 1), last);
}

/**
 * Stock status of a product. Non-stock items (services, fees) have none.
 * "Low" is above zero but under the limit: Flexi minimum (sum of minMJ over
 * the period's cards; 0 = not watched) or the fixed threshold from settings.
 */
export function stockStatus(input: {
  skladove: boolean;
  stock: number;
  minStock: number;
  settings: Pick<ProductSettings, 'lowStockMode' | 'lowStockThreshold'>;
}): StockStatus {
  if (!input.skladove) return 'service';
  if (input.stock <= 0) return 'outOfStock';
  const limit =
    input.settings.lowStockMode === 'threshold' ? input.settings.lowStockThreshold : input.minStock;
  return limit > 0 && input.stock < limit ? 'lowStock' : 'inStock';
}

/** LIKE pattern with %, _ and \ escaped. */
export function likePattern(q: string): string {
  return `%${q.trim().replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

export interface ProductKpi {
  value: number;
  /** Value at the compare date; null when there is no history that far back. */
  previous: number | null;
  /** Per settings.trendFormat; null = no trend to show. */
  trend: number | null;
}

export interface ProductKpis {
  total: ProductKpi;
  inStock: ProductKpi;
  categories: ProductKpi;
  lowStock: ProductKpi;
  /** inStock as a share of stock items, in percent. */
  inStockShare: number | null;
  compareTo: Date;
}

export interface KpiSqlRow {
  total: bigint;
  stock_items: bigint;
  in_stock: bigint;
  low_stock: bigint;
  categories: bigint;
  prev_total: bigint;
  prev_in_stock: bigint;
  prev_low_stock: bigint;
  prev_categories: bigint;
  has_history: boolean;
}

/** SQL row → KPIs with trends (pure; tested). */
export function buildKpis(r: KpiSqlRow, settings: ProductSettings, compareTo: Date): ProductKpis {
  const kpi = (value: bigint, previous: bigint, needsHistory: boolean): ProductKpi => {
    const v = Number(value);
    const p = needsHistory && !r.has_history ? null : Number(previous);
    return { value: v, previous: p, trend: settings.showTrends ? trend(v, p, settings.trendFormat) : null };
  };
  const stockItems = Number(r.stock_items);
  return {
    // Existence "then" comes from create/delete dates, which the mirror only
    // knows since its first sync, so every trend waits for history.
    total: kpi(r.total, r.prev_total, true),
    inStock: kpi(r.in_stock, r.prev_in_stock, true),
    categories: kpi(r.categories, r.prev_categories, true),
    lowStock: kpi(r.low_stock, r.prev_low_stock, true),
    inStockShare: stockItems ? Math.round((Number(r.in_stock) / stockItems) * 1000) / 10 : null,
    compareTo,
  };
}

/** `YYYY-MM-DD` in Prague, for picking the current accounting period. */
export function pragueDate(at: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Prague' }).format(at);
}

// ---------------------------------------------------------------------------
// KPI sparklines
// ---------------------------------------------------------------------------

/**
 * Points of a KPI sparkline, oldest first, the last one `now`: daily for a
 * day/week/month comparison, weekly for a quarter, monthly for a year.
 */
export function sparkBuckets(now: Date, period: ProductSettings['comparePeriod']): Date[] {
  const spec: Record<typeof period, { count: number; step: (d: Date, i: number) => void }> = {
    day: { count: 7, step: (d, i) => d.setUTCDate(d.getUTCDate() - i) },
    week: { count: 8, step: (d, i) => d.setUTCDate(d.getUTCDate() - i) },
    month: { count: 31, step: (d, i) => d.setUTCDate(d.getUTCDate() - i) },
    quarter: { count: 14, step: (d, i) => d.setUTCDate(d.getUTCDate() - 7 * i) },
    year: { count: 13, step: (d, i) => d.setUTCMonth(d.getUTCMonth() - i) },
  };
  const { count, step } = spec[period];
  return Array.from({ length: count }, (_, k) => {
    const d = new Date(now);
    step(d, count - 1 - k);
    return d;
  });
}

export interface SparkSqlRow {
  t: Date;
  total: bigint;
  in_stock: bigint;
  low_stock: bigint;
  categories: bigint;
  has_data: boolean;
}

/** One value per bucket; null where the history doesn't reach yet. */
export interface ProductSparklines {
  at: Date[];
  total: (number | null)[];
  inStock: (number | null)[];
  categories: (number | null)[];
  lowStock: (number | null)[];
  /** Buckets that have data; a line needs at least two. */
  points: number;
}

export function buildSparklines(rows: SparkSqlRow[]): ProductSparklines {
  const val = (r: SparkSqlRow, v: bigint) => (r.has_data ? Number(v) : null);
  return {
    at: rows.map((r) => r.t),
    total: rows.map((r) => val(r, r.total)),
    inStock: rows.map((r) => val(r, r.in_stock)),
    categories: rows.map((r) => val(r, r.categories)),
    lowStock: rows.map((r) => val(r, r.low_stock)),
    points: rows.filter((r) => r.has_data).length,
  };
}
