import { z } from 'zod';

import { decodeBody, MAX_FEED_BYTES, openFeed } from '../checks/feed';
import { networkFailure } from '../checks/net';
import { feedCheckInput, type CheckDeps, type CheckStep, type FeedDialect } from '../checks/types';
import {
  defaultFeedMapping,
  feedMapping,
  mapFeedItem,
  type FeedMapping,
  type FeedTargetKey,
  type SupplierFeedItemRow,
} from './mapping';
import { FeedParseError, parseFeedItems, tagCollector, type FeedTagSummary } from './parse';

const FEED_DIALECTS = ['zbozi', 'shopitem', 'google', 'mergado', 'custom'] as const satisfies readonly FeedDialect[];

/** Element names: letters, digits, `_ - . :`. */
const itemElement = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .regex(/^[A-Za-z_][\w.:-]*$/, 'Invalid element name.');

export const feedPreviewInput = feedCheckInput.extend({ itemElement });
export type FeedPreviewInput = z.infer<typeof feedPreviewInput>;

/** Automatic import intervals the wizard offers (minutes); null = by hand. */
export const FEED_IMPORT_INTERVALS = [60, 360, 1440] as const;

export const supplierFeedInput = feedCheckInput.extend({
  name: z.string().trim().min(1).max(200),
  dialect: z.enum(FEED_DIALECTS),
  itemElement,
  mapping: feedMapping,
  importIntervalMinutes: z
    .union([z.literal(FEED_IMPORT_INTERVALS[0]), z.literal(FEED_IMPORT_INTERVALS[1]), z.literal(FEED_IMPORT_INTERVALS[2])])
    .nullable(),
});
export type SupplierFeedInput = z.infer<typeof supplierFeedInput>;

/** Why reading the feed failed: a check step code (+ params), safe to show. */
export interface FeedFailure {
  code: string;
  params?: Record<string, string | number>;
}

export class FeedReadError extends Error {
  constructor(public readonly failure: FeedFailure) {
    super(failure.code);
    this.name = 'FeedReadError';
  }
}

const fromStep = (s: CheckStep): FeedFailure => ({ code: s.code, ...(s.params ? { params: s.params } : {}) });

/**
 * Downloads the feed (public addresses only, same rules as checkFeed) and
 * streams every item to `onItem`. Throws FeedReadError.
 */
export async function readFeed(
  url: string,
  element: string,
  deps: CheckDeps,
  onItem: Parameters<typeof parseFeedItems>[2],
): Promise<{ items: number; bytes: number; encoding: string }> {
  const signal = AbortSignal.timeout(deps.timeoutMs ?? 120_000);
  const opened = await openFeed(url, deps, signal);
  if (!opened.ok) throw new FeedReadError(fromStep(opened.step));
  const counter = { bytes: 0, encoding: 'utf-8' };
  try {
    const items = await parseFeedItems(
      decodeBody(opened.res.body, opened.res.headers.get('content-type'), counter),
      element,
      onItem,
    );
    return { items, bytes: counter.bytes, encoding: counter.encoding };
  } catch (e) {
    await opened.res.body.cancel().catch(() => undefined);
    if (e instanceof FeedParseError) throw new FeedReadError({ code: e.code, params: e.params });
    if (e instanceof Error && e.message === 'tooLarge') {
      throw new FeedReadError({ code: 'tooLarge', params: { mb: MAX_FEED_BYTES / 1024 / 1024 } });
    }
    throw new FeedReadError({ code: networkFailure(e).code });
  }
}

export interface FeedPreview {
  items: number;
  bytes: number;
  encoding: string;
  tags: FeedTagSummary[];
  /** A first guess, for the mapping screen. */
  mapping: FeedMapping;
}

/** The mapping screen's data: every tag with a sample and the suggested mapping. Read-only. */
export async function previewSupplierFeed(input: FeedPreviewInput, deps: CheckDeps): Promise<FeedPreview> {
  const tags = tagCollector();
  const r = await readFeed(input.url, input.itemElement, deps, (rec) => tags.add(rec));
  const list = tags.list();
  return { ...r, tags: list, mapping: defaultFeedMapping(list.map((t) => t.tag)) };
}

export interface SupplierFeedImportStats {
  items: number;
  written: number;
  /** Items that are no longer in the feed (marked removed). */
  removed: number;
  /** Items without a primary key value. */
  noKey: number;
  /** Repeated primary key; the first item wins. */
  duplicates: number;
  /** Values that didn't fit their column, by column. */
  invalid: Partial<Record<FeedTargetKey, number>>;
  bytes: number;
  ms: number;
}

/** Writes the items of one feed (implemented in @repo/core-db). */
export interface SupplierFeedStore {
  /**
   * Upserts the rows by (feed, kod), clears `removed_at` on them, and marks the
   * feed's other items removed. Returns counts.
   */
  replaceItems(feedId: string, rows: SupplierFeedItemRow[], at: Date): Promise<{ written: number; removed: number }>;
}

export interface SupplierFeedToImport {
  id: string;
  url: string;
  itemElement: string;
  mapping: FeedMapping;
}

/**
 * One import: read the feed, map every item, write them. Nothing is written
 * when reading fails part-way, so a broken download never marks the whole
 * catalogue removed. Never touches Flexi.
 */
export async function importSupplierFeed(
  feed: SupplierFeedToImport,
  deps: CheckDeps & { store: SupplierFeedStore },
): Promise<SupplierFeedImportStats> {
  const now = deps.now ?? Date.now;
  const started = now();
  const rows = new Map<string, SupplierFeedItemRow>();
  const stats: Omit<SupplierFeedImportStats, 'items' | 'written' | 'removed' | 'bytes' | 'ms'> = {
    noKey: 0,
    duplicates: 0,
    invalid: {},
  };
  const r = await readFeed(feed.url, feed.itemElement, deps, (record) => {
    const m = mapFeedItem(record, feed.mapping);
    if (!m.ok) {
      stats.noKey++;
      return;
    }
    if (rows.has(m.row.kod)) {
      stats.duplicates++;
      return;
    }
    rows.set(m.row.kod, m.row);
    for (const k of m.invalid) stats.invalid[k] = (stats.invalid[k] ?? 0) + 1;
  });
  const { written, removed } = await deps.store.replaceItems(feed.id, [...rows.values()], new Date(now()));
  return { ...stats, items: r.items, written, removed, bytes: r.bytes, ms: now() - started };
}

/** When the next automatic import is due; null when imports are by hand. */
export function nextImportAt(intervalMinutes: number | null, from: Date): Date | null {
  return intervalMinutes ? new Date(from.getTime() + intervalMinutes * 60_000) : null;
}
