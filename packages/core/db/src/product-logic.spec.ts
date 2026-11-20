import { describe, expect, it } from '@jest/globals';

import {
  buildKpis,
  buildSparklines,
  clampPage,
  likePattern,
  sparkBuckets,
  stockStatus,
  type KpiSqlRow,
} from './product-logic';
import { DEFAULT_PRODUCT_SETTINGS } from './settings';

const flexiMin = { lowStockMode: 'flexiMin', lowStockThreshold: 5 } as const;
const threshold = { lowStockMode: 'threshold', lowStockThreshold: 5 } as const;

describe('stockStatus', () => {
  it('has no stock status for non-stock items', () => {
    expect(stockStatus({ skladove: false, stock: 0, minStock: 0, settings: flexiMin })).toBe('service');
  });

  it('is out of stock at zero or below', () => {
    expect(stockStatus({ skladove: true, stock: 0, minStock: 3, settings: flexiMin })).toBe('outOfStock');
    expect(stockStatus({ skladove: true, stock: -2, minStock: 0, settings: flexiMin })).toBe('outOfStock');
  });

  it('uses the Flexi minimum, and ignores it when not set', () => {
    expect(stockStatus({ skladove: true, stock: 2, minStock: 3, settings: flexiMin })).toBe('lowStock');
    expect(stockStatus({ skladove: true, stock: 3, minStock: 3, settings: flexiMin })).toBe('inStock');
    expect(stockStatus({ skladove: true, stock: 1, minStock: 0, settings: flexiMin })).toBe('inStock');
  });

  it('uses the fixed threshold when set so', () => {
    expect(stockStatus({ skladove: true, stock: 4, minStock: 0, settings: threshold })).toBe('lowStock');
    expect(stockStatus({ skladove: true, stock: 5, minStock: 99, settings: threshold })).toBe('inStock');
  });
});

describe('paging and search', () => {
  it('clamps the page', () => {
    expect(clampPage(0, 256, 10)).toBe(1);
    expect(clampPage(99, 256, 10)).toBe(26);
    expect(clampPage(3, 0, 10)).toBe(1);
    expect(clampPage(Number.NaN, 20, 10)).toBe(1);
  });

  it('escapes LIKE wildcards', () => {
    expect(likePattern(' 50%_off\\ ')).toBe('%50\\%\\_off\\\\%');
  });
});

describe('buildKpis', () => {
  const row: KpiSqlRow = {
    total: 1248n,
    stock_items: 1200n,
    in_stock: 1120n,
    low_stock: 12n,
    categories: 18n,
    prev_total: 1110n,
    prev_in_stock: 1036n,
    prev_low_stock: 15n,
    prev_categories: 15n,
    has_history: true,
  };
  const at = new Date('2026-10-19T10:00:00Z');

  it('computes values, trends and the in-stock share', () => {
    const k = buildKpis(row, DEFAULT_PRODUCT_SETTINGS, at);
    expect(k.total).toEqual({ value: 1248, previous: 1110, trend: 12.4 });
    expect(k.inStock.trend).toBe(8.1);
    expect(k.lowStock.trend).toBe(-20);
    expect(k.categories).toEqual({ value: 18, previous: 15, trend: 20 });
    expect(k.inStockShare).toBe(93.3);
  });

  it('shows absolute trends when set', () => {
    const k = buildKpis(row, { ...DEFAULT_PRODUCT_SETTINGS, trendFormat: 'absolute' }, at);
    expect(k.categories.trend).toBe(3);
  });

  it('has no trend without history or with trends off', () => {
    expect(buildKpis({ ...row, has_history: false }, DEFAULT_PRODUCT_SETTINGS, at).total).toEqual({
      value: 1248,
      previous: null,
      trend: null,
    });
    expect(buildKpis(row, { ...DEFAULT_PRODUCT_SETTINGS, showTrends: false }, at).total.trend).toBeNull();
  });
});

describe('sparklines', () => {
  const now = new Date('2026-11-19T10:00:00Z');

  it('ends at now with the right step per compare period', () => {
    const month = sparkBuckets(now, 'month');
    expect(month).toHaveLength(31);
    expect(month.at(-1)!.toISOString()).toBe('2026-11-19T10:00:00.000Z');
    expect(month[0]!.toISOString()).toBe('2026-10-20T10:00:00.000Z');
    expect(sparkBuckets(now, 'quarter')[12]!.toISOString()).toBe('2026-11-12T10:00:00.000Z');
    expect(sparkBuckets(now, 'year')[0]!.toISOString()).toBe('2025-11-19T10:00:00.000Z');
  });

  it('leaves out the time before the history starts', () => {
    const row = (t: string, has: boolean, n: bigint) => ({
      t: new Date(t),
      total: n,
      in_stock: n,
      low_stock: 0n,
      categories: 3n,
      has_data: has,
    });
    const s = buildSparklines([row('2026-11-17', false, 5n), row('2026-11-18', true, 6n), row('2026-11-19', true, 7n)]);
    expect(s.inStock).toEqual([null, 6, 7]);
    expect(s.categories).toEqual([null, 3, 3]);
    expect(s.points).toBe(2);
  });
});
