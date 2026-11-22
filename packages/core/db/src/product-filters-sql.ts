// The runtime's helpers are what sql / join / raw are;
// imported from the runtime so the module loads without the generated client.
import { join, raw, sqltag as sql, type Sql } from '@prisma/client/runtime/client';

import { likePattern } from './product-logic';
import { REF_NONE, type ProductFilter, type ProductFilterKey } from './product-filters';

/**
 * SQL for the Products table's filters, against `flexi_cenik c`. Column names
 * come only from COLUMNS below (never from the URL); values are parameters.
 */

/** Plain columns of flexi_cenik; derived fields (status, hasImage) are below. */
const COLUMNS: Record<Exclude<ProductFilterKey, 'status' | 'hasImage'>, string> = {
  nazev: 'nazev',
  kod: 'kod',
  eanKod: 'ean_kod',
  flexiId: 'flexi_id',
  popis: 'popis',
  kratkyPopis: 'kratky_popis',
  klicSlova: 'klic_slova',
  techParam: 'tech_param',
  typZasoby: 'typ_zasoby',
  skupinaZbozi: 'skupina_zbozi_id',
  skladove: 'skladove',
  exportNaEshop: 'export_na_eshop',
  stitky: 'stitky',
  mj1: 'mj1_id',
  platiOdRok: 'plati_od_rok',
  platiDoRok: 'plati_do_rok',
  cenaZaklVcDph: 'cena_zakl_vc_dph',
  cenaZaklBezDph: 'cena_zakl_bez_dph',
  cenaZakl: 'cena_zakl',
  cenaBezna: 'cena_bezna',
  nakupCena: 'nakup_cena',
  typCenyDph: 'typ_ceny_dph',
  typSazbyDph: 'typ_sazby_dph',
  szbDph: 'szb_dph',
  sumStavMj: 'sum_stav_mj',
  sumDostupMj: 'sum_dostup_mj',
  sumRezerMj: 'sum_rezer_mj',
  evidSarze: 'evid_sarze',
  evidExpirace: 'evid_expirace',
  zaruka: 'zaruka',
  mjZaruky: 'mj_zaruky',
  dodaciLhuta: 'dodaci_lhuta',
  mjDodaciLhuty: 'mj_dodaci_lhuty_id',
  hmotnostNetto: 'hmotnost_netto',
  mjHmotnosti: 'mj_hmotnosti_id',
  lastUpdate: 'last_update',
  flexiCreatedAt: 'flexi_created_at',
  syncedAt: 'synced_at',
};

export interface FilterSqlContext {
  /** Today in Prague (YYYY-MM-DD): the accounting period for the minimum stock. */
  today: string;
  /** Fixed low-stock limit, or null to use the cards' minimum stock. */
  threshold: number | null;
}

const IMAGE_FILE = String.raw`\.(jpe?g|png|gif|webp|avif|svg)(\?|$)`;

function statusSql(status: string, ctx: FilterSqlContext): Sql {
  const limit = sql`coalesce(${ctx.threshold}::numeric, (
    SELECT coalesce(sum(k.min_mj), 0) FROM flexi_skladova_karta k
    JOIN flexi_ucetni_obdobi o ON o.id = k.ucetni_obdobi_id
    WHERE k.cenik_id = c.id AND o.plati_od <= ${ctx.today}::date AND o.plati_do >= ${ctx.today}::date
  ))`;
  const low = sql`(${limit} > 0 AND c.sum_stav_mj < ${limit})`;
  switch (status) {
    case 'service':
      return sql`NOT c.skladove`;
    case 'outOfStock':
      return sql`(c.skladove AND c.sum_stav_mj <= 0)`;
    case 'lowStock':
      return sql`(c.skladove AND c.sum_stav_mj > 0 AND ${low})`;
    default:
      return sql`(c.skladove AND c.sum_stav_mj > 0 AND NOT ${low})`;
  }
}

function one(f: ProductFilter, ctx: FilterSqlContext): Sql {
  if (f.key === 'status') {
    const parts = (f as Extract<ProductFilter, { kind: 'enum' }>).values.map((s) => statusSql(s, ctx));
    return sql`(${join(parts, ' OR ')})`;
  }
  if (f.key === 'hasImage') {
    const exists = sql`EXISTS (SELECT 1 FROM flexi_cenik_priloha p WHERE p.cenik_id = c.id
      AND (p.content_type LIKE 'image/%' OR coalesce(p.url, p.odkaz) ~* ${IMAGE_FILE}))`;
    return (f as Extract<ProductFilter, { kind: 'bool' }>).value ? exists : sql`NOT ${exists}`;
  }
  const col = raw(`c.${COLUMNS[f.key]}`);
  switch (f.kind) {
    case 'text':
      if (f.op === 'empty') return sql`(${col} IS NULL OR ${col} = '')`;
      if (f.op === 'notEmpty') return sql`(${col} IS NOT NULL AND ${col} <> '')`;
      if (f.op === 'equals') return sql`lower(${col}) = lower(${f.value})`;
      return sql`${col} ILIKE ${likePattern(f.value)}`;
    case 'number': {
      const parts: Sql[] = [];
      if (f.min !== null) parts.push(sql`${col} >= ${f.min}`);
      if (f.max !== null) parts.push(sql`${col} <= ${f.max}`);
      return sql`(${join(parts, ' AND ')})`;
    }
    case 'date': {
      // Whole days in Prague: from 00:00 of `from` to before 00:00 after `to`.
      const parts: Sql[] = [];
      if (f.from) parts.push(sql`${col} >= (${f.from}::date)::timestamp AT TIME ZONE 'Europe/Prague'`);
      if (f.to) parts.push(sql`${col} < (${f.to}::date + 1)::timestamp AT TIME ZONE 'Europe/Prague'`);
      return sql`(${join(parts, ' AND ')})`;
    }
    case 'bool':
      return sql`${col} = ${f.value}`;
    case 'enum':
      return sql`${col} = ANY(${f.values}::text[])`;
    case 'tags':
      return sql`${col} && ${f.values}::text[]`;
    case 'ref': {
      const ids = f.values.filter((v) => v !== REF_NONE);
      const parts: Sql[] = [];
      if (ids.length) parts.push(sql`${col} = ANY(${ids}::uuid[])`);
      if (ids.length < f.values.length) parts.push(sql`${col} IS NULL`);
      return sql`(${join(parts, ' OR ')})`;
    }
  }
}

/** All filters joined with AND; `TRUE` without filters. */
export function productFilterSql(filters: readonly ProductFilter[], ctx: FilterSqlContext): Sql {
  if (!filters.length) return sql`TRUE`;
  return join(
    filters.map((f) => one(f, ctx)),
    ' AND ',
  );
}
