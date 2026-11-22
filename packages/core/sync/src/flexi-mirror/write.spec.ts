import { describe, expect, it, jest } from '@jest/globals';

import type { MirrorFlexiReader, MirrorStore } from './run';
import {
  buildCenikUpdate,
  productChangesSchema,
  syncOneProduct,
} from './write';

describe('productChangesSchema', () => {
  it('accepts partial changes with decimal commas', () => {
    expect(
      productChangesSchema.parse({ nakupCena: '220,5', skupinaKod: null }),
    ).toEqual({
      nakupCena: '220.5',
      skupinaKod: null,
    });
  });

  it('rejects empty, negative and unknown changes', () => {
    expect(productChangesSchema.safeParse({}).success).toBe(false);
    expect(productChangesSchema.safeParse({ cenaZakl: '-1' }).success).toBe(
      false,
    );
    expect(productChangesSchema.safeParse({ sumStavMj: '5' }).success).toBe(
      false,
    );
    expect(
      productChangesSchema.safeParse({ typSazbyDph: 'dph99' }).success,
    ).toBe(false);
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
    expect(buildCenikUpdate(2, { skupinaKod: null })).toEqual({
      id: '2',
      skupZboz: '',
    });
  });
});

describe('syncOneProduct', () => {
  const NOW = new Date('2026-11-21T10:00:00Z');
  const product = {
    id: '2',
    lastUpdate: '',
    kod: 'BZ_2',
    nazev: 'BZ 2',
    typZasobyK: 'typZasoby.zbozi',
    skladove: 'true',
  };
  const period = {
    id: '8',
    kod: '2026',
    platiOdData: '2026-01-01+01:00',
    platiDoData: '2026-12-31+01:00',
  };
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
  const attachment = {
    id: '14',
    cenik: 'code:BZ_2',
    'cenik@ref': '/c/demo/cenik/2.json',
    nazSoub: 'foto.jpg',
    typK: 'typPrilohy.odkaz',
    mainAttachment: 'true',
    link: 'https://cdn.example.com/foto.jpg',
  };

  function setup(found = true) {
    const rowsFor: Record<string, unknown[]> = {
      cenik: found ? [product] : [],
      'ucetni-obdobi': [period],
      'skladova-karta': [card],
      priloha: [attachment],
    };
    const list = jest.fn(
      async (evidence: string, _o?: { filter?: string }) => ({
        rows: (rowsFor[evidence] ?? []) as never[],
      }),
    );
    const flexi = {
      list,
      changes: jest.fn(),
    } as unknown as MirrorFlexiReader & { list: typeof list };
    const store = {
      upsert: jest.fn(async (_e: string, rows: unknown[]) => ({
        written: rows.length,
        skipped: 0,
      })),
      refreshStock: jest.fn(async () => 0),
      startRun: jest.fn(async () => 'run-1'),
      finishRun: jest.fn(async () => {}),
    } as unknown as MirrorStore & { finishRun: jest.Mock };
    return { flexi, store, list };
  }

  it('reads the product, its attachments and current cards, recomputes stock and records a run', async () => {
    const { flexi, store, list } = setup();
    await expect(
      syncOneProduct({ flexi, store, flexiId: 2, now: () => NOW }),
    ).resolves.toEqual({
      found: true,
      cards: 1,
      runId: 'run-1',
    });
    const filters = Object.fromEntries(
      list.mock.calls.map(([e, o]) => [e, o?.filter]),
    );
    expect(filters).toMatchObject({
      cenik: 'id = 2',
      priloha: 'cenik = 2',
      'skladova-karta': "cenik = 2 and ucetObdobi = 'code:2026'",
    });
    expect(store.upsert).toHaveBeenCalledWith('priloha', [
      expect.objectContaining({
        hlavni: true,
        odkaz: 'https://cdn.example.com/foto.jpg',
      }),
    ]);
    expect(store.refreshStock).toHaveBeenCalledWith(8, NOW);
    expect(store.startRun).toHaveBeenCalledWith('api');
    expect(store.finishRun).toHaveBeenCalledWith(
      'run-1',
      expect.objectContaining({
        status: 'success',
        counts: expect.objectContaining({
          product: 2,
          period: '2026',
          evidences: expect.objectContaining({
            cenik: expect.objectContaining({ written: 1 }),
          }),
        }),
      }),
    );
  });

  it('reports a product Flexi no longer has', async () => {
    const { flexi, store } = setup(false);
    await expect(
      syncOneProduct({ flexi, store, flexiId: 2, now: () => NOW }),
    ).resolves.toMatchObject({ found: false, cards: 0 });
    expect(store.upsert).not.toHaveBeenCalled();
    expect(store.finishRun).toHaveBeenCalledWith(
      'run-1',
      expect.objectContaining({ status: 'failed' }),
    );
  });
});
