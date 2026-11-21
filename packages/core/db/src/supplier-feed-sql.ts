import type { SupplierFeedItemRow } from '@repo/core-sync';

import { toSnakeRows } from './flexi-mirror-sql';

/** Rows per INSERT; keeps one statement's JSON parameter to a few MB. */
export const SUPPLIER_ITEM_CHUNK = 500;

/** jsonb_to_recordset columns, in `supplier_feed_item` names. */
const INPUT = [
  'kod text',
  'nazev text',
  'ean_kod text',
  'kod_vyrobce text',
  'vyrobce text',
  'popis text',
  'kratky_popis text',
  'cena_bezna numeric',
  'nakup_cena numeric',
  'szb_dph numeric',
  'sum_stav_mj numeric',
  'dodaci_lhuta numeric',
  'hmotnost_netto numeric',
  'kategorie text',
  'url text',
  'obrazky jsonb',
  'skupina_variant text',
  'atributy jsonb',
  'raw jsonb',
];
const COLUMNS = INPUT.map((c) => c.split(' ')[0]!);

/**
 * Upserts one chunk of a feed's items: $1 rows (jsonb), $2 feed id, $3 the
 * import time. An item seen again gets its values and `last_seen_at` updated
 * and `removed_at` cleared; `first_seen_at` and the pairing (`cenik_id`) stay.
 */
export const UPSERT_SUPPLIER_ITEMS_SQL = [
  `INSERT INTO supplier_feed_item (feed_id, ${COLUMNS.join(', ')}, first_seen_at, last_seen_at, removed_at)`,
  `SELECT $2::uuid, ${COLUMNS.map((c) =>
    c === 'obrazky' ? `ARRAY(SELECT jsonb_array_elements_text(COALESCE(r.obrazky, '[]'::jsonb)))` : `r.${c}`,
  ).join(', ')}, $3, $3, NULL`,
  `FROM jsonb_to_recordset($1::jsonb) AS r(${INPUT.join(', ')})`,
  `ON CONFLICT (feed_id, kod) DO UPDATE SET ${[...COLUMNS.filter((c) => c !== 'kod'), 'last_seen_at']
    .map((c) => `${c} = EXCLUDED.${c}`)
    .join(', ')}, removed_at = NULL`,
].join('\n');

/** Marks the feed's items not seen in this import ($2) as removed. */
export const MARK_REMOVED_SUPPLIER_ITEMS_SQL = `UPDATE supplier_feed_item SET removed_at = $2
WHERE feed_id = $1::uuid AND last_seen_at < $2 AND removed_at IS NULL`;

const NUL = /\u0000/g; // eslint-disable-line no-control-regex

/** Drops NUL from every string and object key (Postgres text/jsonb can't hold it). */
function stripNul(value: unknown): unknown {
  if (typeof value === 'string') return value.replace(NUL, '');
  if (Array.isArray(value)) return value.map(stripNul);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k.replace(NUL, ''), stripNul(v)]));
  }
  return value;
}

/**
 * Rows as JSON for $1, in chunks. NUL is removed from the values before
 * serialising, never from the JSON text: editing the text could turn a
 * feed's literal "\\u0000" into a broken escape.
 */
export function supplierItemChunks(rows: SupplierFeedItemRow[], size = SUPPLIER_ITEM_CHUNK): string[] {
  const out: string[] = [];
  for (let i = 0; i < rows.length; i += size) {
    out.push(JSON.stringify(stripNul(toSnakeRows(rows.slice(i, i + size)))));
  }
  return out;
}
