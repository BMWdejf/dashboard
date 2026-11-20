import { describe, expect, it } from '@jest/globals';

import {
  compareDate,
  DEFAULT_PRODUCT_SETTINGS,
  parseLocale,
  parsePriceMode,
  parseProductSettings,
  trend,
} from './settings';

describe('settings parsers', () => {
  it('falls back to defaults for unknown values', () => {
    expect(parseLocale('de')).toBe('cs');
    expect(parseLocale('en')).toBe('en');
    expect(parsePriceMode(undefined)).toBe('withVat');
    expect(parsePriceMode('withoutVat')).toBe('withoutVat');
  });

  it('fills missing product settings and repairs bad fields one by one', () => {
    expect(parseProductSettings({})).toEqual(DEFAULT_PRODUCT_SETTINGS);
    expect(parseProductSettings(null)).toEqual(DEFAULT_PRODUCT_SETTINGS);
    expect(
      parseProductSettings({ comparePeriod: 'week', lowStockThreshold: -3, eshopOnly: 'yes' }),
    ).toEqual({ ...DEFAULT_PRODUCT_SETTINGS, comparePeriod: 'week' });
  });

  it('defaults to a monthly percent trend and Flexi minimum stock', () => {
    expect(DEFAULT_PRODUCT_SETTINGS).toEqual({
      showTrends: true,
      comparePeriod: 'month',
      trendFormat: 'percent',
      lowStockMode: 'flexiMin',
      lowStockThreshold: 5,
      includeServices: false,
      eshopOnly: false,
    });
  });
});

describe('trend', () => {
  const now = new Date('2026-11-19T10:00:00Z');

  it('goes back by the compare period', () => {
    expect(compareDate(now, 'day').toISOString()).toBe('2026-11-18T10:00:00.000Z');
    expect(compareDate(now, 'week').toISOString()).toBe('2026-11-12T10:00:00.000Z');
    expect(compareDate(now, 'month').toISOString()).toBe('2026-10-19T10:00:00.000Z');
    expect(compareDate(now, 'quarter').toISOString()).toBe('2026-08-19T10:00:00.000Z');
    expect(compareDate(now, 'year').toISOString()).toBe('2025-11-19T10:00:00.000Z');
  });

  it('computes percent and absolute change', () => {
    expect(trend(1248, 1110, 'percent')).toBe(12.4);
    expect(trend(12, 15, 'absolute')).toBe(-3);
    expect(trend(5, 0, 'percent')).toBeNull();
    expect(trend(5, null, 'absolute')).toBeNull();
  });
});
