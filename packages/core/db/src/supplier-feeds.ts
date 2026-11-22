import type { FeedMapping, SupplierFeedImportStats, SupplierFeedInput, SupplierFeedStore } from '@repo/core-sync';

import { getDb } from './client';
import { Prisma } from './generated/prisma/client';
import {
  CLAIM_SUPPLIER_FEED_SQL,
  MARK_REMOVED_SUPPLIER_ITEMS_SQL,
  supplierItemChunks,
  UPSERT_SUPPLIER_ITEMS_SQL,
} from './supplier-feed-sql';

/**
 * Supplier XML feeds (`supplier_feed`) and their items (`supplier_feed_item`).
 * Items are written only by the feed import (`createSupplierFeedStore`).
 */

export class SupplierFeedExistsError extends Error {
  constructor() {
    super('A feed with this URL already exists.');
    this.name = 'SupplierFeedExistsError';
  }
}

export function createSupplierFeedStore(): SupplierFeedStore {
  const db = getDb();
  return {
    async replaceItems(feedId, rows, at) {
      // One transaction: readers never see half an import.
      return db.$transaction(
        async (tx) => {
          let written = 0;
          for (const json of supplierItemChunks(rows)) {
            written += await tx.$executeRawUnsafe(UPSERT_SUPPLIER_ITEMS_SQL, json, feedId, at);
          }
          const removed = await tx.$executeRawUnsafe(MARK_REMOVED_SUPPLIER_ITEMS_SQL, feedId, at);
          return { written, removed };
        },
        { timeout: 120_000, maxWait: 10_000 },
      );
    },
  };
}

/** Saves a new feed; its first import is due at once. Throws SupplierFeedExistsError. */
export async function createSupplierFeed(input: SupplierFeedInput, userId: string | null, now = new Date()) {
  try {
    const feed = await getDb().supplierFeed.create({
      data: {
        name: input.name,
        url: input.url,
        dialect: input.dialect,
        itemElement: input.itemElement,
        mapping: input.mapping,
        importIntervalMinutes: input.importIntervalMinutes,
        nextImportAt: now,
        createdBy: userId,
      },
      select: { id: true },
    });
    return feed.id;
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new SupplierFeedExistsError();
    throw e;
  }
}

export interface SupplierFeedClaim {
  id: string;
  url: string;
  itemElement: string;
  mapping: FeedMapping;
  importIntervalMinutes: number | null;
}

/**
 * Marks the feed's import as running and returns what the import needs; null
 * when the feed doesn't exist or an import started less than `staleMinutes`
 * ago is still running. Atomic, so two schedulers can't import one feed twice.
 */
export async function claimSupplierFeedImport(id: string, at = new Date(), staleMinutes = 30): Promise<SupplierFeedClaim | null> {
  const rows = await getDb().$queryRawUnsafe<
    { id: string; url: string; item_element: string; mapping: FeedMapping; import_interval_minutes: number | null }[]
  >(
    CLAIM_SUPPLIER_FEED_SQL,
    id,
    at,
    staleMinutes,
  );
  const r = rows[0];
  if (!r) return null;
  return {
    id: r.id,
    url: r.url,
    itemElement: r.item_element,
    mapping: r.mapping,
    importIntervalMinutes: r.import_interval_minutes,
  };
}

/** Records how an import ended and when the next one is due. */
export async function finishSupplierFeedImport(
  id: string,
  result:
    | { status: 'success'; stats: SupplierFeedImportStats; nextImportAt: Date | null }
    | { status: 'failed'; error: string; nextImportAt: Date | null },
) {
  await getDb().supplierFeed.update({
    where: { id },
    data: {
      lastImportStatus: result.status,
      lastImportError: result.status === 'failed' ? result.error : null,
      ...(result.status === 'success' ? { lastImportStats: result.stats as object } : {}),
      nextImportAt: result.nextImportAt,
    },
  });
}

/** Feeds whose automatic import is due. */
export async function listDueSupplierFeedIds(now = new Date(), limit = 20): Promise<string[]> {
  const rows = await getDb().supplierFeed.findMany({
    where: { importIntervalMinutes: { not: null }, nextImportAt: { lte: now } },
    orderBy: { nextImportAt: 'asc' },
    take: limit,
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

export interface SupplierFeedSummary {
  id: string;
  name: string;
  url: string;
  dialect: string;
  importIntervalMinutes: number | null;
  nextImportAt: Date | null;
  lastImportAt: Date | null;
  lastImportStatus: string | null;
  lastImportError: string | null;
  /** Items currently in the feed. */
  items: number;
}

/** Every feed, for the /integrations table. */
export async function listSupplierFeeds(): Promise<SupplierFeedSummary[]> {
  const feeds = await getDb().supplierFeed.findMany({
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      name: true,
      url: true,
      dialect: true,
      importIntervalMinutes: true,
      nextImportAt: true,
      lastImportAt: true,
      lastImportStatus: true,
      lastImportError: true,
      _count: { select: { items: { where: { removedAt: null } } } },
    },
  });
  return feeds.map(({ _count, ...f }) => ({ ...f, items: _count.items }));
}
