import { describe, expect, it, jest } from '@jest/globals';

import type { MirrorFlexiReader, MirrorStore } from './run';
import { buildCenikUpdate, productChangesSchema, syncOneProduct, syncProductsByIds } from './write';

describe('productChangesSchema', () => {
  it('accepts partial changes with decimal commas', () => {
    expect(productChangesSchema.parse({ nakupCena: '220,5', skupinaKod: null })).toEqual({
      nakupCena: '220.5',
      skupinaKod: null,
    });
  });

  it('rejects empty, negative and unknown changes', () => {
    expect(productChangesSchema.safeParse({}).success).toBe(false);
    expect(productChangesSchema.safeParse({ cenaZakl: '-1' }).success).toBe(false);
    expect(productChangesSchema.safeParse({ sumStavMj: '5' }).success).toBe(false);
    expect(productChangesSchema.safeParse({ typSazbyDph: 'dph99' }).success).toBe(false);
  });
});

describe('buildCenikUpdate', () => {
  it('builds the Flexi record (checked against demo.flexibee.eu in dry-run)', () => {
    expect(
      buildCenikUpdate(2, {
        nazev: 'BZ 2',
        nakupCena: '220.5',
        cenaZakl: '799',
        typSazbyDph: 'dphSniz',
        skupinaKod: 'BOTY',
        exportNaEshop: true,
      }),
    ).toEqual({
      id: '2',
      nazev: 'BZ 2',
      nakupCena: '220.5',
      cenaZakl: '799',
      typSzbDphK: 'typSzbDph.dphSniz',
      skupZboz: 'code:BOTY',
      exportNaEshop: 'true',
    });
    expect(buildCenikUpdate(2, { skupinaKod: null })).toEqual({ id: '2', skupZboz: '' });
  });
});

describe('syncOneProduct', () => {
  const NOW = new Date('2026-11-21T10:00:00Z');
  const product = { id: '2', lastUpdate: '', kod: 'BZ_2', nazev: 'BZ 2', typZasobyK: 'typZasoby.zbozi', skladove: 'true' };
  const period = { id: '8', kod: '2026', platiOdData: '2026-01-01+01:00', platiDoData: '2026-12-31+01:00' };
  const card = {
    id: '9',
    cenik: 'code:BZ_2',
    'cenik@ref': '/c/demo/cenik/2.json',
    sklad: 'code:RDX',
    'sklad@ref': '/c/demo/sklad/4.json',
    ucetObdobi: 'code:2026',
    'ucetObdobi@ref': '/c/demo/ucetni-obdobi/8.json',
    stavMJ: '60.0',
  };

  function setup(found = true) {
    const list = jest.fn(async (evidence: string, _o?: { filter?: string }) => ({
      rows: (evidence === 'cenik' ? (found ? [product] : []) : evidence === 'ucetni-obdobi' ? [period] : [card]) as never[],
    }));
    const flexi = { list, changes: jest.fn() } as unknown as MirrorFlexiReader & { list: typeof list };
    const store = {
      upsert: jest.fn(async (_e: string, rows: unknown[]) => ({ written: rows.length, skipped: 0 })),
      refreshStock: jest.fn(async () => 0),
    } as unknown as MirrorStore;
    return { flexi, store, list };
  }

  it('reads the product and its current cards, then recomputes stock', async () => {
    const { flexi, store, list } = setup();
    await expect(syncOneProduct({ flexi, store, flexiId: 2, now: () => NOW })).resolves.toEqual({ found: true, cards: 1 });
    expect(list.mock.calls[0]?.[1]?.filter).toBe('id = 2');
    expect(list.mock.calls[2]?.[1]?.filter).toBe("cenik = 2 and ucetObdobi = 'code:2026'");
    expect(store.refreshStock).toHaveBeenCalledWith(8, NOW);
  });

  it('reports a product Flexi no longer has', async () => {
    const { flexi, store } = setup(false);
    await expect(syncOneProduct({ flexi, store, flexiId: 2, now: () => NOW })).resolves.toEqual({ found: false, cards: 0 });
    expect(store.upsert).not.toHaveBeenCalled();
  });

  it('reads several products in one filtered call, skipping duplicates', async () => {
    const { flexi, store, list } = setup();
    await expect(syncProductsByIds({ flexi, store, flexiIds: [2, 2, 3] })).resolves.toBe(1);
    expect(list).toHaveBeenCalledTimes(1);
    expect(list.mock.calls[0]?.[1]?.filter).toBe('id in (2,3)');
    expect(store.upsert).toHaveBeenCalledTimes(1);
  });
});
