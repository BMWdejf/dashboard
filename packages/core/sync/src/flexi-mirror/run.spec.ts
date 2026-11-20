import { describe, expect, it, jest } from '@jest/globals';

import type { MirrorEvidence } from './evidences';
import type { FlexiRecord } from './map';
import {
  buildFilter,
  currentPeriod,
  pragueDate,
  runFlexiMirrorSync,
  safeError,
  type MirrorFlexiReader,
  type MirrorStore,
  type SyncCursor,
} from './run';

const NOW = new Date('2026-11-19T10:00:00Z');

const period = (id: string, kod: string): FlexiRecord => ({
  id,
  lastUpdate: '2025-01-01T00:00:00+01:00',
  kod,
  platiOdData: `${kod}-01-01+01:00`,
  platiDoData: `${kod}-12-31+01:00`,
});

const product = (id: string, kod: string, lastUpdate = '2026-11-18T12:00:00+01:00'): FlexiRecord => ({
  id,
  lastUpdate,
  kod,
  nazev: `Produkt ${kod}`,
  typZasobyK: 'typZasoby.zbozi',
  skladove: 'true',
});

function fakeFlexi(data: Partial<Record<MirrorEvidence, FlexiRecord[]>>, globalVersion = 100) {
  const list = jest.fn(async (evidence: string, _opts?: { filter?: string; start?: number }) => ({
    rows: (data[evidence as MirrorEvidence] ?? []) as never[],
  }));
  const changes = jest.fn(async () => ({ changes: [], globalVersion, next: undefined }));
  return { list, changes } as unknown as MirrorFlexiReader & {
    list: typeof list;
    changes: typeof changes;
  };
}

function memoryStore() {
  const cursors = new Map<string, SyncCursor>();
  const written: Partial<Record<MirrorEvidence, number[]>> = {};
  const runs: { status: string; counts: unknown; error?: string }[] = [];
  const store: MirrorStore = {
    upsert: async (evidence, rows) => {
      written[evidence] = [...(written[evidence] ?? []), ...rows.map((r) => r.flexiId)];
      return { written: rows.length, skipped: 0 };
    },
    listFlexiIds: async (evidence) => written[evidence] ?? [],
    applyDeletes: jest.fn(async (_e: MirrorEvidence, ids: number[]) => ids.length),
    refreshStock: jest.fn(async () => 3),
    backfillStockHistory: jest.fn(async (deltas: unknown[]) => 100 + deltas.length),
    getCursor: async (key) => cursors.get(key) ?? null,
    setCursor: async (key, c) => {
      cursors.set(key, { lastUpdate: null, changesVersion: null, ...cursors.get(key), ...c });
    },
    startRun: async () => 'run-1',
    finishRun: async (_id, result) => {
      runs.push(result);
    },
  };
  return { store, cursors, written, runs };
}

describe('helpers', () => {
  it('joins filter parts', () => {
    expect(buildFilter([undefined, "kod = 'A'"])).toBe("kod = 'A'");
    expect(buildFilter(['cenik is not empty', "lastUpdate gte 'x'"])).toBe(
      "(cenik is not empty) and (lastUpdate gte 'x')",
    );
    expect(buildFilter([])).toBeUndefined();
  });

  it('finds the current period by Prague date', () => {
    expect(pragueDate(new Date('2026-12-31T23:30:00Z'))).toBe('2027-01-01');
    const periods = [
      { flexiId: 8, lastUpdate: null, kod: '2026', popis: null, platiOd: '2026-01-01', platiDo: '2026-12-31' },
    ];
    expect(currentPeriod(periods, '2026-11-19')?.kod).toBe('2026');
    expect(currentPeriod(periods, '2027-01-01')).toBeUndefined();
  });

  it('removes URLs from error messages', () => {
    expect(safeError(new Error('fetch https://u:p@flexi:5434/c/x failed'))).toBe('fetch [url] failed');
  });
});

describe('runFlexiMirrorSync', () => {
  it('reads everything on the first run and stores cursors', async () => {
    const flexi = fakeFlexi({
      'ucetni-obdobi': [period('8', '2026')],
      cenik: [product('1', 'A'), product('2', 'B', '2026-11-19T09:00:00+01:00')],
    });
    const { store, cursors, runs } = memoryStore();

    const { counts } = await runFlexiMirrorSync({ flexi, store, trigger: 'script', now: () => NOW });

    expect(counts.evidences.cenik).toMatchObject({ fetched: 2, written: 2 });
    expect(counts.period).toBe('2026');
    expect(counts.stockHistoryRows).toBe(3);
    expect(counts.changes).toBe('baseline');
    // The history is rebuilt from movements once, on the first run.
    expect(counts.historyBackfill).toEqual({ since: '2025-10-15', movements: 0, rows: 100 });
    expect(cursors.get('history-backfill')).toBeTruthy();
    expect(cursors.get('cenik')?.lastUpdate?.toISOString()).toBe('2026-11-19T08:00:00.000Z');
    expect(cursors.get('changes')?.changesVersion).toBe(101);
    expect(runs).toEqual([expect.objectContaining({ status: 'success' })]);

    // Stock cards are filtered to the current period.
    const cardCall = flexi.list.mock.calls.find(([e]) => e === 'skladova-karta');
    expect(cardCall?.[1]?.filter).toBe("ucetObdobi = 'code:2026'");
  });

  it('asks only for changes since the cursor on the next run', async () => {
    const flexi = fakeFlexi({ 'ucetni-obdobi': [period('8', '2026')], cenik: [product('1', 'A')] });
    const { store, cursors } = memoryStore();
    cursors.set('cenik', { lastUpdate: new Date('2026-11-01T00:00:00Z'), changesVersion: null });

    await runFlexiMirrorSync({ flexi, store, trigger: 'cron', now: () => NOW });

    const call = flexi.list.mock.calls.find(([e]) => e === 'cenik');
    expect(call?.[1]?.filter).toBe("lastUpdate gte '2026-11-01T00:00:00.000Z'");
  });

  it('applies deletes from the Changes API', async () => {
    const flexi = fakeFlexi({ 'ucetni-obdobi': [period('8', '2026')] });
    flexi.changes.mockResolvedValueOnce({
      changes: [
        { '@evidence': 'cenik', '@in-version': '120', '@operation': 'delete', id: '5' },
        { '@evidence': 'cenik', '@in-version': '121', '@operation': 'update', id: '6' },
        { '@evidence': 'faktura-vydana', '@in-version': '122', '@operation': 'delete', id: '7' },
      ],
      globalVersion: 122,
      next: undefined,
    } as never);
    const { store, cursors } = memoryStore();
    cursors.set('changes', { lastUpdate: null, changesVersion: 110 });

    const { counts } = await runFlexiMirrorSync({ flexi, store, trigger: 'api', now: () => NOW });

    expect(store.applyDeletes).toHaveBeenCalledWith('cenik', [5], NOW);
    expect(counts.evidences.cenik?.deleted).toBe(1);
    expect(cursors.get('changes')?.changesVersion).toBe(123);
  });

  it('keeps going when the changelog is off', async () => {
    const flexi = fakeFlexi({ 'ucetni-obdobi': [period('8', '2026')] });
    flexi.changes.mockRejectedValueOnce(new Error('Changelog is disabled') as never);
    const { store, cursors } = memoryStore();
    cursors.set('changes', { lastUpdate: null, changesVersion: 110 });

    const { counts } = await runFlexiMirrorSync({ flexi, store, trigger: 'api', now: () => NOW });
    expect(counts.changes).toBe('unavailable');
  });

  it('removes what Flexi no longer has in a full run', async () => {
    const flexi = fakeFlexi({ 'ucetni-obdobi': [period('8', '2026')], cenik: [product('1', 'A')] });
    const { store, written } = memoryStore();
    written.cenik = [1, 2];

    await runFlexiMirrorSync({ flexi, store, trigger: 'script', full: true, now: () => NOW });

    expect(store.applyDeletes).toHaveBeenCalledWith('cenik', [2], NOW);
  });

  it('records a failed run and rethrows', async () => {
    const flexi = fakeFlexi({});
    flexi.list.mockRejectedValueOnce(new Error('ABRA Flexi 401: bad login') as never);
    const { store, runs } = memoryStore();

    await expect(runFlexiMirrorSync({ flexi, store, trigger: 'api', now: () => NOW })).rejects.toThrow(
      'bad login',
    );
    expect(runs).toEqual([expect.objectContaining({ status: 'failed', error: 'ABRA Flexi 401: bad login' })]);
  });

  it('pages until a short page', async () => {
    const many = Array.from({ length: 5 }, (_, i) => product(String(i + 1), `P${i}`));
    const flexi = fakeFlexi({ 'ucetni-obdobi': [period('8', '2026')] });
    flexi.list.mockImplementation((async (evidence: string, opts?: { start?: number }) => {
      if (evidence === 'ucetni-obdobi') return { rows: [period('8', '2026')] };
      if (evidence !== 'cenik') return { rows: [] };
      const start = opts?.start ?? 0;
      return { rows: many.slice(start, start + 2) };
    }) as never);
    const { store } = memoryStore();

    const { counts } = await runFlexiMirrorSync({ flexi, store, trigger: 'script', pageSize: 2, now: () => NOW });
    expect(counts.evidences.cenik?.fetched).toBe(5);
  });

  it('rebuilds the history only once unless asked again', async () => {
    const movement = {
      id: '1',
      cenik: 'code:A',
      'cenik@ref': '/c/demo/cenik/1.json',
      datVyst: '2026-11-01+01:00',
      mnozMjPrijem: '2.0',
      mnozMjVydej: '0.0',
      storno: 'false',
    };
    const flexi = fakeFlexi({ 'ucetni-obdobi': [period('8', '2026')] });
    flexi.list.mockImplementation((async (evidence: string) => ({
      rows: evidence === 'ucetni-obdobi' ? [period('8', '2026')] : evidence === 'skladovy-pohyb-polozka' ? [movement] : [],
    })) as never);
    const { store, cursors } = memoryStore();

    await runFlexiMirrorSync({ flexi, store, trigger: 'script', now: () => NOW });
    expect(store.backfillStockHistory).toHaveBeenCalledWith(
      [{ cenikFlexiId: 1, day: '2026-11-01', delta: '2' }],
      '2025-10-15',
    );
    const movementCall = flexi.list.mock.calls.find(([e]) => e === 'skladovy-pohyb-polozka');
    expect(movementCall?.[1]?.filter).toBe("datVyst gt '2025-10-15'");
    expect(cursors.get('history-backfill')).toBeTruthy();

    await runFlexiMirrorSync({ flexi, store, trigger: 'cron', now: () => NOW });
    expect(store.backfillStockHistory).toHaveBeenCalledTimes(1);

    await runFlexiMirrorSync({ flexi, store, trigger: 'script', backfillHistoryDays: 30, now: () => NOW });
    expect(store.backfillStockHistory).toHaveBeenLastCalledWith(expect.any(Array), '2026-10-20');
  });
});
