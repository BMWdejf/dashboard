import { ServiceUnavailableException } from '@nestjs/common';
import { describe, expect, it, jest } from '@jest/globals';

import { FlexiApiError, type FlexiWriteResult } from '@repo/client-flexi';
import { EnvError } from '@repo/core-config';
import type { FeedItemRow } from '@repo/core-db';

import type { FlexiSyncDeps } from '../flexi-sync/flexi-sync.deps';
import { FeedFlexiService, type FeedFlexiDeps } from './feed-flexi.service';

const FEED = '00000000-0000-4000-8000-0000000000f0';
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const row = (n: number, over: Partial<FeedItemRow> = {}): FeedItemRow => ({
  id: id(n),
  kod: String(1000 + n),
  nazev: `Polštář ${n}`,
  eanKod: null,
  popis: null,
  kratkyPopis: null,
  cenaBezna: '121',
  szbDph: '21',
  dodaciLhuta: null,
  hmotnostNetto: null,
  kategorie: null,
  url: null,
  obrazek: null,
  cenik: null,
  changes: [],
  ...over,
});

function make(opts: {
  items: FeedItemRow[];
  existing?: string[];
  upsert?: (records: Record<string, unknown>[]) => Promise<FlexiWriteResult[]>;
  dryRun?: boolean;
  writerError?: Error;
}) {
  const write =
    opts.upsert ??
    (async (records: Record<string, unknown>[]) => records.map((r, i) => ({ 'request-id': String(r.id), id: String(500 + i) })));
  const upsert = jest.fn((_evidence: string, records: Record<string, unknown>[]) => write(records));
  const list = jest.fn(async (_e: string, o?: { filter?: string }) => ({
    rows: [...(o?.filter ?? '').matchAll(/\d+/g)].map((m) => ({ id: m[0], kod: `K${m[0]}`, nazev: 'X', typZasobyK: 'typZasoby.zbozi' })),
  }));
  const storeUpsert = jest.fn(async (_e: string, rows: unknown[]) => ({ written: rows.length, skipped: 0 }));
  const link = jest.fn(async (pairs: unknown[]) => pairs.length);
  const writer = jest.fn((check: boolean) => {
    if (opts.writerError) throw opts.writerError;
    return { upsert, isDryRun: check || (opts.dryRun ?? false) };
  });
  const deps: FeedFlexiDeps = {
    writer,
    sync: () => ({ flexi: { list, changes: jest.fn() }, store: { upsert: storeUpsert } }) as unknown as FlexiSyncDeps,
    repo: {
      items: async (_f, ids) => opts.items.filter((i) => ids.includes(i.id)),
      existingKods: async (kods) => new Set(kods.filter((k) => (opts.existing ?? []).includes(k))),
      link,
    },
  };
  return { service: new FeedFlexiService(deps), upsert, list, link, writer };
}

describe('FeedFlexiService.create', () => {
  it('checks in dry-run and stops each item that cannot be written before Flexi', async () => {
    const linked = row(3, { cenik: { id: 'c', flexiId: 9, kod: 'X', nazev: 'X', eanKod: null, popis: null, kratkyPopis: null, cenaZaklVcDph: null, typSazbyDph: null, dodaciLhuta: null, hmotnostNetto: null } });
    const { service, upsert, link, writer } = make({ items: [row(1), row(2), linked, row(4), row(5)], existing: ['TAKEN'] });
    const r = await service.create(FEED, {
      check: true,
      items: [
        { id: id(1), kod: 'POLSTAR_1001' },
        { id: id(2), kod: 'TAKEN' },
        { id: id(3), kod: 'POLSTAR_1003' },
        { id: id(4), kod: 'SAME' },
        { id: id(5), kod: ' SAME ' },
        { id: id(6), kod: 'MISSING' },
      ],
    });
    expect(writer).toHaveBeenCalledWith(true);
    expect(r.dryRun).toBe(true);
    expect(r.items.map((i) => [i.ok, i.problems[0]])).toEqual([
      [true, undefined],
      [false, 'kodExists'],
      [false, 'alreadyLinked'],
      [false, 'kodDuplicate'],
      [false, 'kodDuplicate'],
      [false, 'notFound'],
    ]);
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(upsert.mock.calls[0]?.[1]).toEqual([expect.objectContaining({ id: `ext:FEED:${id(1)}`, kod: 'POLSTAR_1001' })]);
    expect(link).not.toHaveBeenCalled();
  });

  it("assigns Flexi's errors to the item they belong to, the rest of the request to batchFailed", async () => {
    const { service } = make({
      items: [row(1), row(2)],
      upsert: async () => {
        throw new FlexiApiError(400, ['Zkratku již používá jiný záznam.'], [
          { 'request-id': `ext:FEED:${id(2)}`, errors: [{ message: 'Zkratku již používá jiný záznam.' }] },
        ]);
      },
    });
    const r = await service.create(FEED, { check: true, items: [{ id: id(1), kod: 'A' }, { id: id(2), kod: 'B' }] });
    expect(r.items).toEqual([
      { id: id(1), ok: false, problems: ['batchFailed'], messages: [] },
      { id: id(2), ok: false, problems: [], messages: ['Zkratku již používá jiný záznam.'] },
    ]);
  });

  it('after a real write reads the products back and pairs them by Flexi id', async () => {
    const { service, list, link, writer } = make({ items: [row(1), row(2)] });
    const r = await service.create(FEED, { check: false, items: [{ id: id(1), kod: 'A' }, { id: id(2), kod: 'B' }] });
    expect(writer).toHaveBeenCalledWith(false);
    expect(r).toMatchObject({ dryRun: false, ok: 2, failed: 0, synced: 2, syncFailed: false });
    expect(list.mock.calls[0]?.[1]?.filter).toBe('id in (500,501)');
    expect(link).toHaveBeenCalledWith([
      { itemId: id(1), flexiId: 500 },
      { itemId: id(2), flexiId: 501 },
    ]);
  });

  it('marks items unwritten when Flexi is down, and 503 when it is not configured', async () => {
    const down = make({
      items: [row(1)],
      upsert: async () => {
        throw new FlexiApiError(503, []);
      },
    });
    const r = await down.service.create(FEED, { check: true, items: [{ id: id(1), kod: 'A' }] });
    expect(r.items[0]?.problems).toEqual(['flexiUnavailable']);

    const unset = make({ items: [], writerError: new EnvError(['FLEXI_URL']) });
    await expect(unset.service.create(FEED, { check: true, items: [{ id: id(1), kod: 'A' }] })).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});

describe('FeedFlexiService.update', () => {
  const cenik = {
    id: 'c1',
    flexiId: 77,
    kod: 'A',
    nazev: 'Polštář 1',
    eanKod: null,
    popis: null,
    kratkyPopis: null,
    cenaZaklVcDph: '99',
    typSazbyDph: 'dphZakl',
    dodaciLhuta: null,
    hmotnostNetto: null,
  };

  it('writes the chosen changed fields of paired items only', async () => {
    const { service, upsert, list } = make({ items: [row(1, { cenik }), row(2)], dryRun: false });
    const r = await service.update(FEED, { check: false, items: [id(1), id(2)], fields: ['cena', 'nazev'] });
    expect(upsert.mock.calls[0]?.[1]).toEqual([{ id: '77', typCenyDphK: 'typCeny.sDph', cenaZakl: '121' }]);
    expect(r.items.map((i) => [i.ok, i.problems[0]])).toEqual([
      [true, undefined],
      [false, 'notLinked'],
    ]);
    expect(list.mock.calls[0]?.[1]?.filter).toBe('id in (77)');
  });

  it('reports an item whose chosen fields already match', async () => {
    const { service, upsert } = make({ items: [row(1, { cenik })] });
    const r = await service.update(FEED, { check: true, items: [id(1)], fields: ['nazev'] });
    expect(r.items[0]?.problems).toEqual(['noChanges']);
    expect(upsert).not.toHaveBeenCalled();
  });
});
