import { describe, expect, it } from '@jest/globals';

import {
  decodeFilter,
  encodeFilter,
  parseProductFilters,
  PRODUCT_FILTER_FIELDS,
  withFilters,
  type ProductFilter,
} from './product-filters';
import { productFilterSql } from './product-filters-sql';

const ctx = { today: '2026-11-23', threshold: null };
const UUID = '0b6f3c1e-7a3d-4f0e-9a51-2a1c0d6e9f10';

describe('product filters: URL values', () => {
  it('decodes every kind', () => {
    expect(decodeFilter('nazev', 'contains:kulicky')).toEqual({ key: 'nazev', kind: 'text', op: 'contains', value: 'kulicky' });
    expect(decodeFilter('eanKod', 'empty')).toEqual({ key: 'eanKod', kind: 'text', op: 'empty', value: '' });
    expect(decodeFilter('cenaZaklVcDph', '100..')).toEqual({ key: 'cenaZaklVcDph', kind: 'number', min: 100, max: null });
    expect(decodeFilter('sumStavMj', '..0,5')).toEqual({ key: 'sumStavMj', kind: 'number', min: null, max: 0.5 });
    expect(decodeFilter('lastUpdate', '2026-11-01..2026-11-23')).toEqual({
      key: 'lastUpdate',
      kind: 'date',
      from: '2026-11-01',
      to: '2026-11-23',
    });
    expect(decodeFilter('skladove', 'false')).toEqual({ key: 'skladove', kind: 'bool', value: false });
    expect(decodeFilter('typZasoby', 'zbozi,sluzba')).toEqual({ key: 'typZasoby', kind: 'enum', values: ['zbozi', 'sluzba'] });
    expect(decodeFilter('skupinaZbozi', `${UUID},none`)).toEqual({ key: 'skupinaZbozi', kind: 'ref', values: [UUID, 'none'] });
    expect(decodeFilter('stitky', 'AKCE, NOVINKA')).toEqual({ key: 'stitky', kind: 'tags', values: ['AKCE', 'NOVINKA'] });
  });

  it('swaps a reversed range', () => {
    expect(decodeFilter('nakupCena', '500..100')).toMatchObject({ min: 100, max: 500 });
    expect(decodeFilter('syncedAt', '2026-12-01..2026-01-01')).toMatchObject({ from: '2026-01-01', to: '2026-12-01' });
  });

  it('rejects invalid values and unknown keys', () => {
    for (const [k, v] of [
      ['nazev', 'like:x'],
      ['nazev', 'contains:'],
      ['cenaZakl', '..'],
      ['cenaZakl', 'abc..1'],
      ['lastUpdate', '2026-02-30..'],
      ['skladove', 'yes'],
      ['typZasoby', 'zbozi,neco'],
      ['skupinaZbozi', 'not-a-uuid'],
      ['raw', 'contains:x'],
      ['deletedAt', '2026-01-01..'],
    ] as const) {
      expect(decodeFilter(k, v)).toBeNull();
    }
  });

  it('round-trips through encodeFilter', () => {
    const values: Record<string, string> = {
      text: 'equals:ABC',
      number: '1.5..20',
      date: '..2026-01-31',
      bool: 'true',
      enum: '',
      ref: 'none',
      tags: 'A,B',
    };
    for (const field of PRODUCT_FILTER_FIELDS) {
      const raw = field.kind === 'enum' ? field.options[0] : values[field.kind]!;
      const f = decodeFilter(field.key, raw);
      expect(f).not.toBeNull();
      expect(decodeFilter(field.key, encodeFilter(f!))).toEqual(f);
    }
  });

  it('reads f.* params in field order and replaces them', () => {
    const params = new URLSearchParams('q=x&f.skladove=true&f.nazev=contains:a&f.bogus=1&page=2');
    const filters = parseProductFilters(params);
    expect(filters.map((f) => f.key)).toEqual(['nazev', 'skladove']);
    const next = withFilters(params, [filters[0]!]);
    expect(next.toString()).toBe('q=x&page=2&f.nazev=contains%3Aa');
    expect(parseProductFilters({ 'f.kod': ['equals:A', 'equals:B'] })).toEqual([
      { key: 'kod', kind: 'text', op: 'equals', value: 'A' },
    ]);
  });
});

describe('product filters: SQL', () => {
  const sql = (filters: ProductFilter[]) => {
    const s = productFilterSql(filters, ctx);
    return { text: s.text.replace(/\s+/g, ' '), values: s.values };
  };

  it('is TRUE without filters', () => {
    expect(sql([]).text).toBe('TRUE');
  });

  it('uses whitelisted columns and parameters', () => {
    const r = sql([
      { key: 'nazev', kind: 'text', op: 'contains', value: '50%' },
      { key: 'cenaZaklVcDph', kind: 'number', min: 10, max: null },
      { key: 'typZasoby', kind: 'enum', values: ['zbozi'] },
    ]);
    expect(r.text).toBe('c.nazev ILIKE $1 AND (c.cena_zakl_vc_dph >= $2) AND c.typ_zasoby = ANY($3::text[])');
    expect(r.values).toEqual(['%50\\%%', 10, ['zbozi']]);
  });

  it('matches empty text, missing refs and Prague days', () => {
    expect(sql([{ key: 'eanKod', kind: 'text', op: 'empty', value: '' }]).text).toBe(
      "(c.ean_kod IS NULL OR c.ean_kod = '')",
    );
    const ref = sql([{ key: 'skupinaZbozi', kind: 'ref', values: [UUID, 'none'] }]);
    expect(ref.text).toBe('(c.skupina_zbozi_id = ANY($1::uuid[]) OR c.skupina_zbozi_id IS NULL)');
    expect(ref.values).toEqual([[UUID]]);
    expect(sql([{ key: 'lastUpdate', kind: 'date', from: null, to: '2026-11-23' }]).text).toBe(
      "(c.last_update < ($1::date + 1)::timestamp AT TIME ZONE 'Europe/Prague')",
    );
  });

  it('derives the stock status like stockStatus()', () => {
    const r = sql([{ key: 'status', kind: 'enum', values: ['service', 'lowStock'] }]);
    expect(r.text).toContain('(NOT c.skladove OR (c.skladove AND c.sum_stav_mj > 0 AND (');
    expect(r.text).toContain('flexi_skladova_karta');
    expect(r.values).toContain('2026-11-23');
  });
});
