import { getDb } from './client';
import { productFilterSql } from './product-filters-sql';
import {
  buildKpis,
  buildSparklines,
  clampPage,
  likePattern,
  pragueDate,
  sparkBuckets,
  stockStatus,
  type KpiSqlRow,
  type ProductKpis,
  type ProductListQuery,
  type ProductListRow,
  type ProductSparklines,
  type SparkSqlRow,
} from './product-logic';
import { compareDate, type ProductSettings } from './settings';

export * from './product-logic';

/**
 * Product list and KPIs for the Products page, read from the Flexi mirror.
 * The pure parts are in product-logic.ts.
 */

interface ListSqlRow {
  id: string;
  kod: string;
  nazev: string;
  ean_kod: string | null;
  skupina_kod: string | null;
  skupina_nazev: string | null;
  price: string | null;
  stock: string;
  min_stock: string;
  unit: string | null;
  skladove: boolean;
}

export async function listProducts(
  query: ProductListQuery,
): Promise<{ rows: ProductListRow[]; total: number; page: number }> {
  const db = getDb();
  const q = query.q?.trim() ? likePattern(query.q) : null;
  const today = pragueDate(query.now ?? new Date());
  const withVat = query.priceMode === 'withVat';
  const threshold = query.settings.lowStockMode === 'threshold' ? query.settings.lowStockThreshold : null;
  const filters = productFilterSql(query.filters ?? [], { today, threshold });

  // One round trip: the page's rows with the total (count(*) OVER () runs
  // before LIMIT). The minimum stock is summed only for the rows on the page.
  const pageRows = (page: number) => db.$queryRaw<(ListSqlRow & { total: bigint })[]>`
    WITH matched AS (
      SELECT c.*, count(*) OVER () AS total
      FROM flexi_cenik c
      WHERE c.deleted_at IS NULL
        AND (${q}::text IS NULL OR c.nazev ILIKE ${q} OR c.kod ILIKE ${q} OR c.ean_kod ILIKE ${q})
        AND ${filters}
      ORDER BY c.nazev, c.kod
      LIMIT ${query.perPage} OFFSET ${(page - 1) * query.perPage}
    )
    SELECT m.id, m.kod, m.nazev, m.ean_kod, m.skladove, m.total,
           s.kod AS skupina_kod, s.nazev AS skupina_nazev,
           (CASE WHEN ${withVat} THEN m.cena_zakl_vc_dph ELSE m.cena_zakl_bez_dph END)::text AS price,
           m.sum_stav_mj::text AS stock,
           coalesce((
             SELECT sum(k.min_mj) FROM flexi_skladova_karta k
             JOIN flexi_ucetni_obdobi o ON o.id = k.ucetni_obdobi_id
             WHERE k.cenik_id = m.id AND o.plati_od <= ${today}::date AND o.plati_do >= ${today}::date
           ), 0)::text AS min_stock,
           mj.kod AS unit
    FROM matched m
    LEFT JOIN flexi_skupina_zbozi s ON s.id = m.skupina_zbozi_id
    LEFT JOIN flexi_merna_jednotka mj ON mj.id = m.mj1_id
    ORDER BY m.nazev, m.kod`;

  let page = Math.max(1, Math.floor(query.page) || 1);
  let rows = await pageRows(page);
  let total = Number(rows[0]?.total ?? 0n);
  if (!rows.length && page > 1) {
    // Past the last page (e.g. an old link): count, clamp, read again.
    const [c] = await db.$queryRaw<{ count: bigint }[]>`
      SELECT count(*) FROM flexi_cenik c
      WHERE c.deleted_at IS NULL
        AND (${q}::text IS NULL OR c.nazev ILIKE ${q} OR c.kod ILIKE ${q} OR c.ean_kod ILIKE ${q})
        AND ${filters}`;
    total = Number(c?.count ?? 0n);
    page = clampPage(page, total, query.perPage);
    if (total) rows = await pageRows(page);
  }

  return {
    total,
    page,
    rows: rows.map((r) => ({
      id: r.id,
      kod: r.kod,
      nazev: r.nazev,
      eanKod: r.ean_kod,
      skupinaKod: r.skupina_kod,
      skupinaNazev: r.skupina_nazev,
      price: r.price,
      stock: r.stock,
      unit: r.unit,
      status: stockStatus({
        skladove: r.skladove,
        stock: Number(r.stock),
        minStock: Number(r.min_stock),
        settings: query.settings,
      }),
    })),
  };
}

// ---------------------------------------------------------------------------
// KPIs
// ---------------------------------------------------------------------------

/**
 * KPI cards with trends. "Then" values use the stock history
 * (flexi_cenik_stav_historie) and product create/delete dates; before the first
 * sync there is no history, so `previous` is null and no trend is shown.
 */
export async function getProductKpis(settings: ProductSettings, now = new Date()): Promise<ProductKpis> {
  const then = compareDate(now, settings.comparePeriod);
  const today = pragueDate(now);
  const threshold = settings.lowStockMode === 'threshold' ? settings.lowStockThreshold : null;

  const [r] = await getDb().$queryRaw<KpiSqlRow[]>`
    WITH period AS (
      SELECT id FROM flexi_ucetni_obdobi
      WHERE plati_od <= ${today}::date AND plati_do >= ${today}::date LIMIT 1
    ), mins AS (
      SELECT k.cenik_id, sum(k.min_mj) AS min_stock
      FROM flexi_skladova_karta k JOIN period p ON p.id = k.ucetni_obdobi_id
      GROUP BY k.cenik_id
    ), scope AS (
      SELECT c.*, coalesce(m.min_stock, 0) AS min_stock,
        (SELECT h.stav_mj FROM flexi_cenik_stav_historie h
          WHERE h.cenik_id = c.id AND h.plati_od <= ${then}
          ORDER BY h.plati_od DESC LIMIT 1) AS stock_then
      FROM flexi_cenik c LEFT JOIN mins m ON m.cenik_id = c.id
      WHERE (${settings.eshopOnly} = false OR c.export_na_eshop)
        AND (${settings.includeServices} OR c.skladove)
    ), flags AS (
      SELECT s.*,
        s.deleted_at IS NULL AS alive_now,
        (s.flexi_created_at IS NULL OR s.flexi_created_at <= ${then})
          AND (s.deleted_at IS NULL OR s.deleted_at > ${then}) AS alive_then,
        coalesce(${threshold}::numeric, s.min_stock) AS low_limit
      FROM scope s
    )
    SELECT
      count(*) FILTER (WHERE alive_now) AS total,
      count(*) FILTER (WHERE alive_now AND skladove) AS stock_items,
      count(*) FILTER (WHERE alive_now AND skladove AND sum_stav_mj > 0) AS in_stock,
      count(*) FILTER (WHERE alive_now AND skladove AND sum_stav_mj > 0
                         AND low_limit > 0 AND sum_stav_mj < low_limit) AS low_stock,
      count(DISTINCT skupina_zbozi_id) FILTER (WHERE alive_now) AS categories,
      count(*) FILTER (WHERE alive_then) AS prev_total,
      count(*) FILTER (WHERE alive_then AND skladove AND stock_then > 0) AS prev_in_stock,
      count(*) FILTER (WHERE alive_then AND skladove AND stock_then > 0
                         AND low_limit > 0 AND stock_then < low_limit) AS prev_low_stock,
      count(DISTINCT skupina_zbozi_id) FILTER (WHERE alive_then) AS prev_categories,
      EXISTS (SELECT 1 FROM flexi_cenik_stav_historie WHERE plati_od <= ${then}) AS has_history
    FROM flags`;

  return buildKpis(r!, settings, then);
}

/**
 * Values of the four KPIs over time, for the sparklines on the cards. Stock
 * comes from the history intervals (a row is valid until the product's next
 * row), product existence from create/delete dates; the same filters as the KPIs.
 */
export async function getProductSparklines(
  settings: ProductSettings,
  now = new Date(),
): Promise<ProductSparklines> {
  const buckets = sparkBuckets(now, settings.comparePeriod);
  const today = pragueDate(now);
  const threshold = settings.lowStockMode === 'threshold' ? settings.lowStockThreshold : null;

  const rows = await getDb().$queryRaw<SparkSqlRow[]>`
    WITH b AS (
      SELECT unnest(${buckets}::timestamptz[]) AS t
    ), period AS (
      SELECT id FROM flexi_ucetni_obdobi
      WHERE plati_od <= ${today}::date AND plati_do >= ${today}::date LIMIT 1
    ), mins AS (
      SELECT k.cenik_id, sum(k.min_mj) AS min_stock
      FROM flexi_skladova_karta k JOIN period p ON p.id = k.ucetni_obdobi_id
      GROUP BY k.cenik_id
    ), scope AS (
      SELECT c.id, c.skladove, c.skupina_zbozi_id, c.flexi_created_at, c.deleted_at,
             coalesce(${threshold}::numeric, coalesce(m.min_stock, 0)) AS low_limit
      FROM flexi_cenik c LEFT JOIN mins m ON m.cenik_id = c.id
      WHERE (${settings.eshopOnly} = false OR c.export_na_eshop)
        AND (${settings.includeServices} OR c.skladove)
    ), iv AS (
      SELECT h.cenik_id, h.stav_mj, h.plati_od,
             lead(h.plati_od) OVER (PARTITION BY h.cenik_id ORDER BY h.plati_od) AS until
      FROM flexi_cenik_stav_historie h
    ), first AS (
      SELECT min(plati_od) AS at FROM flexi_cenik_stav_historie
    )
    SELECT b.t,
      (SELECT count(*) FROM scope s
        WHERE (s.flexi_created_at IS NULL OR s.flexi_created_at <= b.t)
          AND (s.deleted_at IS NULL OR s.deleted_at > b.t)) AS total,
      (SELECT count(DISTINCT s.skupina_zbozi_id) FROM scope s
        WHERE (s.flexi_created_at IS NULL OR s.flexi_created_at <= b.t)
          AND (s.deleted_at IS NULL OR s.deleted_at > b.t)) AS categories,
      (SELECT count(*) FROM iv JOIN scope s ON s.id = iv.cenik_id
        WHERE iv.plati_od <= b.t AND (iv.until IS NULL OR iv.until > b.t)
          AND (s.deleted_at IS NULL OR s.deleted_at > b.t)
          AND s.skladove AND iv.stav_mj > 0) AS in_stock,
      (SELECT count(*) FROM iv JOIN scope s ON s.id = iv.cenik_id
        WHERE iv.plati_od <= b.t AND (iv.until IS NULL OR iv.until > b.t)
          AND (s.deleted_at IS NULL OR s.deleted_at > b.t)
          AND s.skladove AND iv.stav_mj > 0
          AND s.low_limit > 0 AND iv.stav_mj < s.low_limit) AS low_stock,
      coalesce(b.t >= (SELECT at FROM first), false) AS has_data
    FROM b ORDER BY b.t`;

  return buildSparklines(rows);
}

/** Whether the mirror has any products yet (before the first sync it doesn't). */
export async function hasMirroredProducts(): Promise<boolean> {
  const row = await getDb().flexiCenik.findFirst({ select: { id: true } });
  return row !== null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * One product with everything the mirror has about it, for /products/[id].
 * Stock cards only of the current accounting period. null when the id is not
 * a UUID or the product doesn't exist.
 */
export async function getProductDetail(id: string, now = new Date()) {
  if (!UUID.test(id)) return null;
  const today = new Date(`${pragueDate(now)}T00:00:00Z`);
  return getDb().flexiCenik.findUnique({
    where: { id },
    include: {
      skupinaZbozi: { select: { kod: true, nazev: true } },
      mj1: { select: { kod: true, nazev: true } },
      mjHmotnosti: { select: { kod: true } },
      skladoveKarty: {
        where: { ucetniObdobi: { platiOd: { lte: today }, platiDo: { gte: today } } },
        include: { sklad: { select: { kod: true, nazev: true } } },
        orderBy: { sklad: { kod: 'asc' } },
      },
      atributy: {
        include: { typAtributu: { select: { kod: true, nazev: true } } },
        orderBy: { typAtributu: { kod: 'asc' } },
      },
      odberatele: { include: { firma: { select: { kod: true, nazev: true } } }, take: 50 },
      dodavatele: { include: { firma: { select: { kod: true, nazev: true } } }, take: 50 },
      prilohy: { orderBy: [{ hlavni: 'desc' }, { nazevSouboru: 'asc' }] },
      // Supplier feed items paired with the product, items still in the feed first.
      supplierItems: {
        select: {
          kod: true,
          nazev: true,
          nakupCena: true,
          cenaBezna: true,
          szbDph: true,
          sumStavMj: true,
          kategorie: true,
          lastSeenAt: true,
          removedAt: true,
          feed: { select: { id: true, name: true, lastImportAt: true, lastImportStatus: true } },
        },
        orderBy: [{ removedAt: { sort: 'desc', nulls: 'first' } }, { lastSeenAt: 'desc' }],
        take: 10,
      },
    },
  });
}

export type ProductDetail = NonNullable<Awaited<ReturnType<typeof getProductDetail>>>;

export interface FilterOption {
  id: string;
  kod: string;
  nazev: string | null;
}

/** Choices for the Products filters: goods groups, units and the labels in use. */
export async function getProductFilterOptions(): Promise<{
  groups: FilterOption[];
  units: FilterOption[];
  tags: string[];
}> {
  const db = getDb();
  const [groups, units, tags] = await Promise.all([
    db.flexiSkupinaZbozi.findMany({ select: { id: true, kod: true, nazev: true }, orderBy: [{ nazev: 'asc' }, { kod: 'asc' }] }),
    db.flexiMernaJednotka.findMany({ select: { id: true, kod: true, nazev: true }, orderBy: { kod: 'asc' } }),
    db.$queryRaw<{ tag: string }[]>`
      SELECT DISTINCT unnest(stitky) AS tag FROM flexi_cenik WHERE deleted_at IS NULL ORDER BY 1 LIMIT 500`,
  ]);
  return { groups, units, tags: tags.map((t) => t.tag) };
}
