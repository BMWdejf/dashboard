import { describe, expect, it } from '@jest/globals';

import type { SupplierFeedItemRow } from '@repo/core-sync';

import {
  CLAIM_SUPPLIER_FEED_SQL,
  MARK_REMOVED_SUPPLIER_ITEMS_SQL,
  supplierItemChunks,
  UPSERT_SUPPLIER_ITEMS_SQL,
} from './supplier-feed-sql';

const row = (kod: string): SupplierFeedItemRow => ({
  kod,
  nazev: 'A\u0000B',
  eanKod: null,
  kodVyrobce: null,
  vyrobce: null,
  popis: null,
  kratkyPopis: null,
  cenaBezna: '489.00',
  nakupCena: null,
  szbDph: '21',
  sumStavMj: null,
  dodaciLhuta: null,
  hmotnostNetto: null,
  kategorie: null,
  url: null,
  obrazky: ['https://cdn.example/1.jpg'],
  skupinaVariant: null,
  atributy: { Barva: 'bílá' },
  raw: {},
});

describe('supplier feed SQL', () => {
  it('chunks rows as snake_case JSON without NUL', () => {
    const chunks = supplierItemChunks([row('1'), row('2'), row('3')], 2);
    expect(chunks).toHaveLength(2);
    const first = JSON.parse(chunks[0]!) as Record<string, unknown>[];
    expect(first[0]).toMatchObject({ kod: '1', nazev: 'AB', cena_bezna: '489.00', szb_dph: '21', atributy: { Barva: 'bílá' } });
  });

  it('strips NUL from values and keys, and keeps a literal backslash-u0000 intact', () => {
    const tricky = { ...row('9'), nazev: 'a\\u0000"b', raw: { ['T\u0000AG']: ['x\u0000y'] } };
    const [json] = supplierItemChunks([tricky]);
    const [parsed] = JSON.parse(json!) as Record<string, unknown>[];
    expect(parsed).toMatchObject({ nazev: 'a\\u0000"b', raw: { TAG: ['xy'] } });
  });

  it('keeps first_seen_at and the pairing on conflict, clears removed_at', () => {
    const update = UPSERT_SUPPLIER_ITEMS_SQL.split('DO UPDATE SET')[1]!;
    expect(update).toContain('removed_at = NULL');
    expect(update).toContain('last_seen_at = EXCLUDED.last_seen_at');
    expect(update).not.toContain('first_seen_at');
    expect(update).not.toContain('cenik_id');
    expect(update).not.toContain('kod = EXCLUDED.kod');
  });

  // Untyped parameters made Postgres read `$2 - make_interval(...)` as
  // interval - interval, so every claim failed (42883) and no feed imported.
  it('types every timestamp parameter', () => {
    expect(CLAIM_SUPPLIER_FEED_SQL).toContain('$2::timestamptz - make_interval(mins => $3::int)');
    expect(CLAIM_SUPPLIER_FEED_SQL).not.toMatch(/\$2(?!::)/);
    expect(UPSERT_SUPPLIER_ITEMS_SQL).not.toMatch(/\$3(?!::)/);
    expect(MARK_REMOVED_SUPPLIER_ITEMS_SQL).not.toMatch(/\$2(?!::)/);
  });
});
