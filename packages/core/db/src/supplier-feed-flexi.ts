import { feedItemChanges, type CenikForFeed, type FeedFieldChange, type FeedItemForFlexi } from '@repo/core-sync';

import { getDb } from './client';
import type { Prisma } from './generated/prisma/client';

/**
 * Supplier feed items on their way to ABRA Flexi: the feed page lists them as
 * new (not in Flexi yet), in Flexi (paired with a mirrored product) and
 * changed (paired, and the feed differs from the product).
 */

export type FeedItemStatus = 'new' | 'linked' | 'changed';

export interface FeedItemRow extends FeedItemForFlexi {
  kategorie: string | null;
  url: string | null;
  obrazek: string | null;
  cenik: (CenikForFeed & { id: string }) | null;
  /** Differences from the paired product; empty when not paired. */
  changes: FeedFieldChange[];
}

const ITEM_SELECT = {
  id: true,
  kod: true,
  nazev: true,
  eanKod: true,
  popis: true,
  kratkyPopis: true,
  cenaBezna: true,
  szbDph: true,
  dodaciLhuta: true,
  hmotnostNetto: true,
  kategorie: true,
  url: true,
  obrazky: true,
  cenik: {
    select: {
      id: true,
      flexiId: true,
      kod: true,
      nazev: true,
      eanKod: true,
      popis: true,
      kratkyPopis: true,
      cenaZaklVcDph: true,
      typSazbyDph: true,
      dodaciLhuta: true,
      hmotnostNetto: true,
      deletedAt: true,
      prilohy: { select: { odkaz: true, hlavni: true } },
    },
  },
} satisfies Prisma.SupplierFeedItemSelect;

type Selected = Prisma.SupplierFeedItemGetPayload<{ select: typeof ITEM_SELECT }>;
const dec = (d: { toString(): string } | null) => (d === null ? null : d.toString());

function toRow(i: Selected): FeedItemRow {
  const base: FeedItemForFlexi = {
    id: i.id,
    kod: i.kod,
    nazev: i.nazev,
    eanKod: i.eanKod,
    popis: i.popis,
    kratkyPopis: i.kratkyPopis,
    cenaBezna: dec(i.cenaBezna),
    szbDph: dec(i.szbDph),
    dodaciLhuta: dec(i.dodaciLhuta),
    hmotnostNetto: dec(i.hmotnostNetto),
    obrazky: i.obrazky,
  };
  // A product deleted in Flexi counts as not paired.
  const c = i.cenik && !i.cenik.deletedAt ? i.cenik : null;
  const cenik = c
    ? {
        id: c.id,
        flexiId: c.flexiId,
        kod: c.kod,
        nazev: c.nazev,
        eanKod: c.eanKod,
        popis: c.popis,
        kratkyPopis: c.kratkyPopis,
        cenaZaklVcDph: dec(c.cenaZaklVcDph),
        typSazbyDph: c.typSazbyDph,
        dodaciLhuta: dec(c.dodaciLhuta),
        hmotnostNetto: dec(c.hmotnostNetto),
        odkazy: c.prilohy.flatMap((p) => (p.odkaz ? [p.odkaz] : [])),
        maHlavniPrilohu: c.prilohy.some((p) => p.hlavni),
      }
    : null;
  return {
    ...base,
    kategorie: i.kategorie,
    url: i.url,
    obrazek: i.obrazky[0] ?? null,
    cenik,
    changes: cenik ? feedItemChanges(base, cenik) : [],
  };
}

const live = (feedId: string): Prisma.SupplierFeedItemWhereInput => ({ feedId, removedAt: null });
const paired: Prisma.SupplierFeedItemWhereInput = { cenik: { is: { deletedAt: null } } };
const unpaired: Prisma.SupplierFeedItemWhereInput = { OR: [{ cenikId: null }, { cenik: { is: { deletedAt: { not: null } } } }] };

/** Paired items with their differences; few thousand at most per feed. */
async function changedItems(feedId: string, extra: Prisma.SupplierFeedItemWhereInput = {}) {
  const rows = await getDb().supplierFeedItem.findMany({
    where: { AND: [live(feedId), paired, extra] },
    orderBy: { kod: 'asc' },
    select: ITEM_SELECT,
  });
  return rows.map(toRow).filter((r) => r.changes.length > 0);
}

export interface SupplierFeedOverview {
  id: string;
  name: string;
  url: string;
  lastImportAt: Date | null;
  lastImportStatus: string | null;
  counts: Record<FeedItemStatus, number>;
}

export async function getSupplierFeedOverview(feedId: string): Promise<SupplierFeedOverview | null> {
  const db = getDb();
  const feed = await db.supplierFeed.findUnique({
    where: { id: feedId },
    select: { id: true, name: true, url: true, lastImportAt: true, lastImportStatus: true },
  });
  if (!feed) return null;
  const [fresh, linked, changed] = await Promise.all([
    db.supplierFeedItem.count({ where: { AND: [live(feedId), unpaired] } }),
    db.supplierFeedItem.count({ where: { AND: [live(feedId), paired] } }),
    changedItems(feedId),
  ]);
  return { ...feed, counts: { new: fresh, linked, changed: changed.length } };
}

function search(q: string | undefined): Prisma.SupplierFeedItemWhereInput {
  const s = q?.trim();
  if (!s) return {};
  return {
    OR: [
      { kod: { contains: s, mode: 'insensitive' } },
      { nazev: { contains: s, mode: 'insensitive' } },
      { eanKod: { contains: s } },
    ],
  };
}

/** One page of the feed's current items with the given status. */
export async function listSupplierFeedItems(
  feedId: string,
  opts: { status: FeedItemStatus; q?: string; page: number; perPage: number },
): Promise<{ rows: FeedItemRow[]; total: number }> {
  const skip = (Math.max(1, opts.page) - 1) * opts.perPage;
  if (opts.status === 'changed') {
    const all = await changedItems(feedId, search(opts.q));
    return { rows: all.slice(skip, skip + opts.perPage), total: all.length };
  }
  const where = { AND: [live(feedId), opts.status === 'new' ? unpaired : paired, search(opts.q)] };
  const db = getDb();
  const [rows, total] = await Promise.all([
    db.supplierFeedItem.findMany({ where, orderBy: { kod: 'asc' }, skip, take: opts.perPage, select: ITEM_SELECT }),
    db.supplierFeedItem.count({ where }),
  ]);
  return { rows: rows.map(toRow), total };
}

/** The feed's current items with these ids (others are left out). */
export async function getSupplierFeedItems(feedId: string, ids: string[]): Promise<FeedItemRow[]> {
  const rows = await getDb().supplierFeedItem.findMany({
    where: { ...live(feedId), id: { in: ids } },
    select: ITEM_SELECT,
  });
  return rows.map(toRow);
}

/** Which of these codes a (not deleted) product in the mirror already has. */
export async function findExistingFlexiKods(kods: string[]): Promise<Set<string>> {
  if (kods.length === 0) return new Set();
  const rows = await getDb().flexiCenik.findMany({
    where: { kod: { in: kods }, deletedAt: null },
    select: { kod: true },
  });
  return new Set(rows.map((r) => r.kod));
}

/** Pairs items with mirrored products by Flexi id; returns how many were paired. */
export async function linkSupplierFeedItems(pairs: { itemId: string; flexiId: number }[]): Promise<number> {
  if (pairs.length === 0) return 0;
  return getDb().$executeRawUnsafe(
    `UPDATE supplier_feed_item i SET cenik_id = c.id
     FROM unnest($1::uuid[], $2::int[]) AS p(item_id, flexi_id)
     JOIN flexi_cenik c ON c.flexi_id = p.flexi_id
     WHERE i.id = p.item_id`,
    pairs.map((p) => p.itemId),
    pairs.map((p) => p.flexiId),
  );
}
