import type { FlexiChange, ListOptions } from '@repo/client-flexi';

import {
  BASE_FILTER,
  DETAIL,
  FULL_EVIDENCES,
  MIRROR_EVIDENCES,
  type MirrorEvidence,
} from './evidences';
import { mapRecords, type FlexiRecord, type MirrorRows, type UcetniObdobiRow } from './map';
import { MOVEMENT_DETAIL, MOVEMENT_EVIDENCE, movementDeltas, type MovementDelta } from './movements';

/** The part of FlexiClient the sync needs (read-only). */
export interface MirrorFlexiReader {
  list<T = Record<string, unknown>>(
    evidence: string,
    opts?: ListOptions,
  ): Promise<{ rows: T[]; rowCount?: number }>;
  changes(opts?: {
    start?: number;
    limit?: number;
  }): Promise<{ changes: FlexiChange[]; globalVersion?: number; next?: number }>;
}

export interface SyncCursor {
  lastUpdate: Date | null;
  changesVersion: number | null;
}

export type SyncTrigger = 'script' | 'api' | 'cron';

export interface EvidenceCounts {
  fetched: number;
  written: number;
  /** Rows whose parent (product, warehouse…) isn't in the mirror. */
  skipped: number;
  /** Records that couldn't be mapped (see `errors`). */
  invalid: number;
  deleted: number;
}

export interface SyncCounts {
  evidences: Partial<Record<MirrorEvidence, EvidenceCounts>>;
  /** Current accounting period used for stock cards, e.g. "2026". */
  period?: string;
  stockHistoryRows?: number;
  /** One-off rebuild of the stock history from movements (first run, or asked for). */
  historyBackfill?: { since: string; movements: number; rows: number };
  changes?: 'baseline' | 'read' | 'unavailable';
  /** First mapping errors, for the run log. */
  errors: string[];
}

/** Writes the mirror. Implemented in @repo/core-db (createFlexiMirrorStore). */
export interface MirrorStore {
  upsert<E extends MirrorEvidence>(
    evidence: E,
    rows: MirrorRows[E][],
  ): Promise<{ written: number; skipped: number }>;
  /** Flexi ids currently in the mirror (for reconciling deletes in a full run). */
  listFlexiIds(evidence: MirrorEvidence): Promise<number[]>;
  /** A product is marked deleted (kept for history); other rows are removed. */
  applyDeletes(evidence: MirrorEvidence, flexiIds: number[], at: Date): Promise<number>;
  /**
   * Recomputes each product's stock totals from its cards in the given period and
   * appends a history row where the total changed. Returns history rows written.
   */
  refreshStock(periodFlexiId: number, at: Date): Promise<number>;
  /**
   * Writes the stock history backwards from movements: a row at `since` for
   * every live product and one per product per movement day, valued
   * "current stock − changes after that day". Only before each product's first
   * existing history row; returns rows written.
   */
  backfillStockHistory(deltas: MovementDelta[], since: string): Promise<number>;
  getCursor(key: string): Promise<SyncCursor | null>;
  setCursor(key: string, cursor: Partial<SyncCursor>): Promise<void>;
  startRun(trigger: SyncTrigger): Promise<string>;
  finishRun(
    id: string,
    result: { status: 'success' | 'failed'; counts: SyncCounts; error?: string },
  ): Promise<void>;
}

export interface MirrorSyncOptions {
  flexi: MirrorFlexiReader;
  store: MirrorStore;
  trigger: SyncTrigger;
  /** Ignore cursors, read everything and remove what Flexi no longer has. */
  full?: boolean;
  now?: () => Date;
  log?: (msg: string) => void;
  pageSize?: number;
  /**
   * Rebuild the stock history from movements this many days back. Done
   * automatically once (DEFAULT_BACKFILL_DAYS) if it never ran; set to run it again.
   */
  backfillHistoryDays?: number;
}

/** Enough for the yearly KPI comparison and its 13-month sparkline. */
export const DEFAULT_BACKFILL_DAYS = 400;
const BACKFILL_KEY = 'history-backfill';

export interface MirrorSyncResult {
  runId: string;
  counts: SyncCounts;
}

const MAX_LOGGED_ERRORS = 20;
const CHANGES_KEY = 'changes';

/** `YYYY-MM-DD` of `at` in Prague (accounting periods are calendar dates there). */
export function pragueDate(at: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Prague' }).format(at);
}

/** The period that contains `today` (`YYYY-MM-DD`), if any. */
export function currentPeriod(
  periods: UcetniObdobiRow[],
  today: string,
): UcetniObdobiRow | undefined {
  return periods.find((p) => p.platiOd <= today && today <= p.platiDo);
}

/** Flexi filter expression joining the parts with `and`. */
export function buildFilter(parts: (string | undefined | null)[]): string | undefined {
  const p = parts.filter((x): x is string => !!x);
  return p.length ? p.map((x) => (p.length > 1 ? `(${x})` : x)).join(' and ') : undefined;
}

/** Message safe to store and show: no URLs (they could carry credentials). */
export function safeError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  return msg.replace(/https?:\/\/\S+/g, '[url]').slice(0, 1000);
}

/**
 * One sync run ABRA Flexi → Neon mirror. Read-only towards Flexi.
 *
 * 1. Code lists (groups, units, warehouses, attribute types, periods): whole.
 * 2. Other evidences: only records changed since the stored cursor
 *    (`lastUpdate gte …`), paged by id. Stock cards only for the current period.
 * 3. Product stock totals recomputed from the cards; history row on change.
 * 4. Deletes from the Changes API (or, in a full run, by comparing ids).
 */
export async function runFlexiMirrorSync(opts: MirrorSyncOptions): Promise<MirrorSyncResult> {
  const { flexi, store, full = false } = opts;
  const now = opts.now ?? (() => new Date());
  const log = opts.log ?? (() => {});
  const pageSize = opts.pageSize ?? 1000;
  const counts: SyncCounts = { evidences: {}, errors: [] };
  const startedAt = now();
  const runId = await store.startRun(opts.trigger);

  const tally = (e: MirrorEvidence): EvidenceCounts =>
    (counts.evidences[e] ??= { fetched: 0, written: 0, skipped: 0, invalid: 0, deleted: 0 });

  /** Reads one evidence (all pages), writes it, returns the mapped rows' max lastUpdate. */
  async function syncEvidence<E extends MirrorEvidence>(
    evidence: E,
    filterParts: (string | undefined)[],
    collect?: MirrorRows[E][],
  ): Promise<{ maxLastUpdate: Date | null; seenIds: number[] }> {
    const t = tally(evidence);
    let maxLastUpdate: Date | null = null;
    const seenIds: number[] = [];
    const filter = buildFilter([BASE_FILTER[evidence], ...filterParts]);
    for (let start = 0; ; start += pageSize) {
      const { rows } = await flexi.list<FlexiRecord>(evidence, {
        filter,
        detail: DETAIL[evidence],
        limit: pageSize,
        start,
        query: { order: 'id' },
      });
      t.fetched += rows.length;
      const mapped = mapRecords(evidence, rows);
      t.invalid += mapped.errors.length;
      for (const err of mapped.errors) {
        if (counts.errors.length < MAX_LOGGED_ERRORS) counts.errors.push(err.message);
      }
      if (mapped.rows.length) {
        const w = await store.upsert(evidence, mapped.rows);
        t.written += w.written;
        t.skipped += w.skipped;
      }
      for (const row of mapped.rows) {
        seenIds.push(row.flexiId);
        if (row.lastUpdate && (!maxLastUpdate || row.lastUpdate > maxLastUpdate)) {
          maxLastUpdate = row.lastUpdate;
        }
        collect?.push(row);
      }
      if (rows.length < pageSize) break;
    }
    log(`${evidence}: ${t.fetched} read, ${t.written} written, ${t.skipped} skipped`);
    return { maxLastUpdate, seenIds };
  }

  /** Full run: whatever the mirror has but Flexi didn't return is gone in Flexi. */
  async function reconcile(evidence: MirrorEvidence, seenIds: number[]) {
    const seen = new Set(seenIds);
    const missing = (await store.listFlexiIds(evidence)).filter((id) => !seen.has(id));
    if (missing.length) tally(evidence).deleted += await store.applyDeletes(evidence, missing, now());
  }

  async function incremental(evidence: MirrorEvidence, key: string, extra?: string) {
    const cursor = full ? null : await store.getCursor(key);
    const since = cursor?.lastUpdate ? `lastUpdate gte '${cursor.lastUpdate.toISOString()}'` : undefined;
    const { maxLastUpdate, seenIds } = await syncEvidence(evidence, [extra, since]);
    if (full && evidence !== 'skladova-karta') await reconcile(evidence, seenIds);
    if (maxLastUpdate) await store.setCursor(key, { lastUpdate: maxLastUpdate });
  }

  try {
    // 1. Code lists, whole every time.
    const periods: UcetniObdobiRow[] = [];
    for (const evidence of MIRROR_EVIDENCES.filter((e) => FULL_EVIDENCES.has(e))) {
      const { seenIds } = await syncEvidence(
        evidence,
        [],
        evidence === 'ucetni-obdobi' ? (periods as MirrorRows[typeof evidence][]) : undefined,
      );
      if (full) await reconcile(evidence, seenIds);
    }

    // 2. Changed records.
    await incremental('adresar', 'adresar');
    await incremental('cenik', 'cenik');

    const period = currentPeriod(periods, pragueDate(startedAt));
    if (period) {
      counts.period = period.kod;
      // A new period starts with its own cursor.
      await incremental('skladova-karta', `skladova-karta:${period.kod}`, `ucetObdobi = 'code:${period.kod}'`);
    } else {
      counts.errors.push(`No accounting period covers ${pragueDate(startedAt)}; stock cards skipped.`);
    }

    for (const evidence of ['atribut', 'odberatel', 'dodavatel', 'priloha'] as const) {
      await incremental(evidence, evidence);
    }

    // 3. Deletes since the last run.
    if (!full) await readDeletes();

    // 4. Stock totals and history.
    if (period) counts.stockHistoryRows = await store.refreshStock(period.flexiId, now());

    // 5. Once: rebuild the history backwards from stock movements.
    if (period && (opts.backfillHistoryDays !== undefined || !(await store.getCursor(BACKFILL_KEY)))) {
      await backfillHistory(opts.backfillHistoryDays ?? DEFAULT_BACKFILL_DAYS);
    }

    await store.finishRun(runId, { status: 'success', counts });
    return { runId, counts };
  } catch (e) {
    const error = safeError(e);
    log(`sync failed: ${error}`);
    await store.finishRun(runId, { status: 'failed', counts, error }).catch(() => {});
    throw e;
  }

  async function backfillHistory(days: number) {
    const sinceDate = new Date(startedAt);
    sinceDate.setUTCDate(sinceDate.getUTCDate() - days);
    const since = pragueDate(sinceDate);
    const lines: FlexiRecord[] = [];
    for (let start = 0; ; start += pageSize) {
      const { rows } = await flexi.list<FlexiRecord>(MOVEMENT_EVIDENCE, {
        filter: `datVyst gt '${since}'`,
        detail: MOVEMENT_DETAIL,
        limit: pageSize,
        start,
        query: { order: 'id' },
      });
      lines.push(...rows);
      if (rows.length < pageSize) break;
    }
    const rows = await store.backfillStockHistory(movementDeltas(lines), since);
    counts.historyBackfill = { since, movements: lines.length, rows };
    await store.setCursor(BACKFILL_KEY, { lastUpdate: now() });
    log(`history backfill since ${since}: ${lines.length} movements, ${rows} rows`);
  }

  async function readDeletes() {
    let changes;
    const cursor = await store.getCursor(CHANGES_KEY);
    try {
      if (cursor?.changesVersion == null) {
        // First run: start reading from the current version.
        const head = await flexi.changes({ limit: 1 });
        if (head.globalVersion !== undefined) {
          await store.setCursor(CHANGES_KEY, { changesVersion: head.globalVersion + 1 });
        }
        counts.changes = 'baseline';
        return;
      }
      let start = cursor.changesVersion;
      const deletes = new Map<MirrorEvidence, number[]>();
      const mirrored = new Set<string>(MIRROR_EVIDENCES);
      for (;;) {
        changes = await flexi.changes({ start, limit: pageSize });
        for (const c of changes.changes) {
          const v = Number(c['@in-version']);
          if (v >= start) start = v + 1;
          if (c['@operation'] !== 'delete' || !mirrored.has(c['@evidence'])) continue;
          const ev = c['@evidence'] as MirrorEvidence;
          deletes.set(ev, [...(deletes.get(ev) ?? []), Number(c.id)]);
        }
        if (changes.next === undefined || changes.changes.length === 0) break;
        start = Math.max(start, changes.next);
      }
      for (const [ev, ids] of deletes) tally(ev).deleted += await store.applyDeletes(ev, ids, now());
      await store.setCursor(CHANGES_KEY, { changesVersion: start });
      counts.changes = 'read';
    } catch (e) {
      // The changelog may be switched off in the company; the sync still works,
      // deletes then come only from a full run.
      counts.changes = 'unavailable';
      counts.errors.push(`Changes API: ${safeError(e)}`);
    }
  }
}
