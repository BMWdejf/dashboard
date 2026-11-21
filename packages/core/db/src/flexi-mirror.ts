import type {
  MirrorEvidence,
  MirrorRows,
  MirrorStore,
  SyncCounts,
  SyncCursor,
  SyncTrigger,
} from '@repo/core-sync';

import { getDb } from './client';
import {
  BACKFILL_HISTORY_SQL,
  REFRESH_STOCK_SQL,
  STOCK_HISTORY_SQL,
  TABLE,
  toSnakeRows,
  upsertSql,
} from './flexi-mirror-sql';

/**
 * Writes the Flexi mirror (tables `flexi_*`). Used only by the sync
 * (@repo/core-sync `runFlexiMirrorSync`); nothing else writes these tables.
 *
 * Each page is one `INSERT … SELECT FROM jsonb_to_recordset($1) … ON CONFLICT
 * (flexi_id) DO UPDATE`. References arrive as Flexi ids and are resolved to our
 * UUIDs by joins; a row whose required parent isn't in the mirror is skipped
 * (and counted), the next run picks it up once the parent exists.
 */

export function createFlexiMirrorStore(): MirrorStore {
  const db = getDb();

  return {
    async upsert<E extends MirrorEvidence>(evidence: E, rows: MirrorRows[E][]) {
      if (!rows.length) return { written: 0, skipped: 0 };
      // Postgres text/jsonb can't hold NUL; Flexi data sometimes has it.
      const json = JSON.stringify(toSnakeRows(rows)).replace(/\\u0000/g, '');
      const written = await db.$executeRawUnsafe(upsertSql(evidence), json);
      return { written, skipped: rows.length - written };
    },

    async listFlexiIds(evidence) {
      const where = evidence === 'cenik' ? ' WHERE deleted_at IS NULL' : '';
      const rows = await db.$queryRawUnsafe<{ flexi_id: number }[]>(
        `SELECT flexi_id FROM ${TABLE[evidence]}${where}`,
      );
      return rows.map((r) => r.flexi_id);
    },

    async applyDeletes(evidence, flexiIds, at) {
      if (!flexiIds.length) return 0;
      if (evidence === 'cenik') {
        // Keep the product for history; free its code, which Flexi may reuse.
        return db.$executeRawUnsafe(
          `UPDATE flexi_cenik SET deleted_at = $2, kod = kod || '~deleted~' || flexi_id
           WHERE flexi_id = ANY($1::int[]) AND deleted_at IS NULL`,
          flexiIds,
          at,
        );
      }
      return db.$executeRawUnsafe(
        `DELETE FROM ${TABLE[evidence]} WHERE flexi_id = ANY($1::int[])`,
        flexiIds,
      );
    },

    async refreshStock(periodFlexiId, at) {
      await db.$executeRawUnsafe(REFRESH_STOCK_SQL, periodFlexiId);
      return db.$executeRawUnsafe(STOCK_HISTORY_SQL, at);
    },

    async backfillStockHistory(deltas, since) {
      return db.$executeRawUnsafe(BACKFILL_HISTORY_SQL, JSON.stringify(toSnakeRows(deltas)), since);
    },

    async getCursor(key): Promise<SyncCursor | null> {
      const row = await db.flexiSyncState.findUnique({ where: { evidence: key } });
      if (!row) return null;
      return {
        lastUpdate: row.lastUpdate,
        changesVersion: row.changesVersion === null ? null : Number(row.changesVersion),
      };
    },

    async setCursor(key, cursor) {
      const data = {
        ...(cursor.lastUpdate !== undefined ? { lastUpdate: cursor.lastUpdate } : {}),
        ...(cursor.changesVersion !== undefined
          ? { changesVersion: cursor.changesVersion === null ? null : BigInt(cursor.changesVersion) }
          : {}),
      };
      await db.flexiSyncState.upsert({
        where: { evidence: key },
        create: { evidence: key, ...data },
        update: data,
      });
    },

    async startRun(trigger: SyncTrigger) {
      const run = await db.flexiSyncRun.create({ data: { trigger } });
      return run.id;
    },

    async finishRun(id, result: { status: 'success' | 'failed'; counts: SyncCounts; error?: string }) {
      await db.flexiSyncRun.update({
        where: { id },
        data: {
          status: result.status,
          finishedAt: new Date(),
          counts: result.counts as object,
          error: result.error ?? null,
        },
      });
    },
  };
}

/** A run still in progress (started in the last `staleMinutes`), if any. */
export async function getRunningFlexiSync(staleMinutes = 30) {
  return getDb().flexiSyncRun.findFirst({
    where: { status: 'running', startedAt: { gt: new Date(Date.now() - staleMinutes * 60_000) } },
    orderBy: { startedAt: 'desc' },
  });
}

export async function getFlexiSyncRun(id: string) {
  return getDb().flexiSyncRun.findUnique({ where: { id } });
}

/** Last finished or running sync, for the "Live Sync" badge. */
export async function getLastFlexiSync() {
  return getDb().flexiSyncRun.findFirst({ orderBy: { startedAt: 'desc' } });
}

/** Latest sync runs, newest first, for the run log on the product detail. */
export async function getRecentFlexiSyncRuns(limit = 6) {
  return getDb().flexiSyncRun.findMany({
    orderBy: { startedAt: 'desc' },
    take: limit,
    select: { id: true, trigger: true, status: true, startedAt: true, finishedAt: true, counts: true, error: true },
  });
}
