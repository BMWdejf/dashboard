import type { MirrorEvidence } from '@repo/core-sync';

/** SQL for the Flexi mirror store (pure; tested). See flexi-mirror.ts. */

export const TABLE: Record<MirrorEvidence, string> = {
  'skupina-zbozi': 'flexi_skupina_zbozi',
  'merna-jednotka': 'flexi_merna_jednotka',
  sklad: 'flexi_sklad',
  'typ-atributu': 'flexi_typ_atributu',
  'ucetni-obdobi': 'flexi_ucetni_obdobi',
  adresar: 'flexi_adresar',
  cenik: 'flexi_cenik',
  'skladova-karta': 'flexi_skladova_karta',
  atribut: 'flexi_cenik_atribut',
  odberatel: 'flexi_cenik_odberatel',
  dodavatel: 'flexi_cenik_dodavatel',
  priloha: 'flexi_cenik_priloha',
};

/** camelCase row keys → snake_case JSON keys for jsonb_to_recordset. */
export function toSnakeRows(rows: object[]): Record<string, unknown>[] {
  return rows.map((row) =>
    Object.fromEntries(
      Object.entries(row).map(([k, v]) => [k.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`), v]),
    ),
  );
}

interface UpsertSpec {
  /** Columns of the recordset: `name type`. */
  input: string[];
  /** Target columns (besides flexi_id, last_update, synced_at). */
  columns: string[];
  /** SELECT expressions for `columns`, in the same order. */
  select: string[];
  /** JOINs that resolve references (aliases used in `select`). */
  joins?: string[];
}

const BASE_INPUT = ['flexi_id int', 'last_update timestamptz'];

const codebook = (extra: { input: string[]; columns: string[] } = { input: [], columns: [] }): UpsertSpec => ({
  input: ['kod text', 'nazev text', ...extra.input],
  columns: ['kod', 'nazev', ...extra.columns],
  select: ['r.kod', 'r.nazev', ...extra.columns.map((c) => `r.${c}`)],
});

/** Required parent → INNER JOIN, optional → LEFT JOIN. */
const ref = (table: string, alias: string, field: string, required: boolean) =>
  `${required ? 'JOIN' : 'LEFT JOIN'} ${table} ${alias} ON ${alias}.flexi_id = r.${field}`;

const SPECS: Record<MirrorEvidence, UpsertSpec> = {
  'skupina-zbozi': codebook(),
  'merna-jednotka': codebook(),
  sklad: codebook(),
  'typ-atributu': codebook({ input: ['typ text'], columns: ['typ'] }),
  'ucetni-obdobi': {
    input: ['kod text', 'popis text', 'plati_od date', 'plati_do date'],
    columns: ['kod', 'popis', 'plati_od', 'plati_do'],
    select: ['r.kod', 'r.popis', 'r.plati_od', 'r.plati_do'],
  },
  adresar: codebook({ input: ['ic text', 'dic text'], columns: ['ic', 'dic'] }),
  cenik: {
    input: [
      'flexi_created_at timestamptz',
      'kod text',
      'nazev text',
      'popis text',
      'kratky_popis text',
      'klic_slova text',
      'tech_param text',
      'ean_kod text',
      'typ_zasoby text',
      'skladove boolean',
      'export_na_eshop boolean',
      'skupina_zbozi_flexi_id int',
      'mj1_flexi_id int',
      'stitky text[]',
      'plati_od_rok int',
      'plati_do_rok int',
      'typ_ceny_dph text',
      'typ_sazby_dph text',
      'szb_dph numeric',
      'cena_zakl numeric',
      'cena_zakl_bez_dph numeric',
      'cena_zakl_vc_dph numeric',
      'cena_bezna numeric',
      'nakup_cena numeric',
      'sum_stav_mj numeric',
      'sum_dostup_mj numeric',
      'sum_rezer_mj numeric',
      'zaruka int',
      'mj_zaruky text',
      'dodaci_lhuta numeric',
      'mj_dodaci_lhuty_flexi_id int',
      'hmotnost_netto numeric',
      'mj_hmotnosti_flexi_id int',
      'evid_sarze boolean',
      'evid_expirace boolean',
      'raw jsonb',
    ],
    columns: [
      'flexi_created_at',
      'kod',
      'nazev',
      'popis',
      'kratky_popis',
      'klic_slova',
      'tech_param',
      'ean_kod',
      'typ_zasoby',
      'skladove',
      'export_na_eshop',
      'skupina_zbozi_id',
      'mj1_id',
      'stitky',
      'plati_od_rok',
      'plati_do_rok',
      'typ_ceny_dph',
      'typ_sazby_dph',
      'szb_dph',
      'cena_zakl',
      'cena_zakl_bez_dph',
      'cena_zakl_vc_dph',
      'cena_bezna',
      'nakup_cena',
      'sum_stav_mj',
      'sum_dostup_mj',
      'sum_rezer_mj',
      'zaruka',
      'mj_zaruky',
      'dodaci_lhuta',
      'mj_dodaci_lhuty_id',
      'hmotnost_netto',
      'mj_hmotnosti_id',
      'evid_sarze',
      'evid_expirace',
      'raw',
      // A product that comes back after a delete is alive again.
      'deleted_at',
    ],
    select: [
      'r.flexi_created_at',
      'r.kod',
      'r.nazev',
      'r.popis',
      'r.kratky_popis',
      'r.klic_slova',
      'r.tech_param',
      'r.ean_kod',
      'r.typ_zasoby',
      'r.skladove',
      'r.export_na_eshop',
      'sk.id',
      'mj1.id',
      "coalesce(r.stitky, '{}')",
      'r.plati_od_rok',
      'r.plati_do_rok',
      'r.typ_ceny_dph',
      'r.typ_sazby_dph',
      'r.szb_dph',
      'r.cena_zakl',
      'r.cena_zakl_bez_dph',
      'r.cena_zakl_vc_dph',
      'r.cena_bezna',
      'r.nakup_cena',
      'r.sum_stav_mj',
      'r.sum_dostup_mj',
      'r.sum_rezer_mj',
      'r.zaruka',
      'r.mj_zaruky',
      'r.dodaci_lhuta',
      'mjd.id',
      'r.hmotnost_netto',
      'mjh.id',
      'r.evid_sarze',
      'r.evid_expirace',
      'r.raw',
      'NULL::timestamptz',
    ],
    joins: [
      ref('flexi_skupina_zbozi', 'sk', 'skupina_zbozi_flexi_id', false),
      ref('flexi_merna_jednotka', 'mj1', 'mj1_flexi_id', false),
      ref('flexi_merna_jednotka', 'mjd', 'mj_dodaci_lhuty_flexi_id', false),
      ref('flexi_merna_jednotka', 'mjh', 'mj_hmotnosti_flexi_id', false),
    ],
  },
  'skladova-karta': {
    input: [
      'cenik_flexi_id int',
      'sklad_flexi_id int',
      'ucetni_obdobi_flexi_id int',
      'stav_mj numeric',
      'min_mj numeric',
      'max_mj numeric',
      'rezerv_mj numeric',
      'dostup_mj numeric',
    ],
    columns: ['cenik_id', 'sklad_id', 'ucetni_obdobi_id', 'stav_mj', 'min_mj', 'max_mj', 'rezerv_mj', 'dostup_mj'],
    select: ['c.id', 's.id', 'o.id', 'r.stav_mj', 'r.min_mj', 'r.max_mj', 'r.rezerv_mj', 'r.dostup_mj'],
    joins: [
      ref('flexi_cenik', 'c', 'cenik_flexi_id', true),
      ref('flexi_sklad', 's', 'sklad_flexi_id', true),
      ref('flexi_ucetni_obdobi', 'o', 'ucetni_obdobi_flexi_id', true),
    ],
  },
  atribut: {
    input: ['cenik_flexi_id int', 'typ_atributu_flexi_id int', 'hodnota text', 'val_numeric numeric', 'raw jsonb'],
    columns: ['cenik_id', 'typ_atributu_id', 'hodnota', 'val_numeric', 'raw'],
    select: ['c.id', 't.id', 'r.hodnota', 'r.val_numeric', 'r.raw'],
    joins: [
      ref('flexi_cenik', 'c', 'cenik_flexi_id', true),
      ref('flexi_typ_atributu', 't', 'typ_atributu_flexi_id', true),
    ],
  },
  odberatel: {
    input: [
      'cenik_flexi_id int',
      'firma_flexi_id int',
      'mena text',
      'prodej_cena numeric',
      'plati_od date',
      'plati_do date',
      'raw jsonb',
    ],
    columns: ['cenik_id', 'firma_id', 'mena', 'prodej_cena', 'plati_od', 'plati_do', 'raw'],
    select: ['c.id', 'f.id', 'r.mena', 'r.prodej_cena', 'r.plati_od', 'r.plati_do', 'r.raw'],
    joins: [ref('flexi_cenik', 'c', 'cenik_flexi_id', true), ref('flexi_adresar', 'f', 'firma_flexi_id', false)],
  },
  dodavatel: {
    input: ['cenik_flexi_id int', 'firma_flexi_id int', 'mena text', 'nakup_cena numeric', 'primarni boolean', 'raw jsonb'],
    columns: ['cenik_id', 'firma_id', 'mena', 'nakup_cena', 'primarni', 'raw'],
    select: ['c.id', 'f.id', 'r.mena', 'r.nakup_cena', 'r.primarni', 'r.raw'],
    joins: [ref('flexi_cenik', 'c', 'cenik_flexi_id', true), ref('flexi_adresar', 'f', 'firma_flexi_id', false)],
  },
  priloha: {
    input: [
      'cenik_flexi_id int',
      'nazev_souboru text',
      'content_type text',
      'typ text',
      'data_size int',
      'data_hash text',
      'hlavni boolean',
      'odkaz text',
    ],
    columns: ['cenik_id', 'nazev_souboru', 'content_type', 'typ', 'data_size', 'data_hash', 'hlavni', 'odkaz'],
    select: ['c.id', 'r.nazev_souboru', 'r.content_type', 'r.typ', 'r.data_size', 'r.data_hash', 'r.hlavni', 'r.odkaz'],
    joins: [ref('flexi_cenik', 'c', 'cenik_flexi_id', true)],
  },
};

/** The upsert statement for an evidence ($1 = jsonb array of snake_case rows). */
export function upsertSql(evidence: MirrorEvidence): string {
  const spec = SPECS[evidence];
  const table = TABLE[evidence];
  if (spec.columns.length !== spec.select.length) {
    throw new Error(`${evidence}: ${spec.columns.length} columns but ${spec.select.length} values`);
  }
  const cols = ['flexi_id', 'last_update', 'synced_at', ...spec.columns];
  const select = ['r.flexi_id', 'r.last_update', 'now()', ...spec.select];
  const updates = cols.filter((c) => c !== 'flexi_id').map((c) => `${c} = EXCLUDED.${c}`);
  return [
    `INSERT INTO ${table} (${cols.join(', ')})`,
    `SELECT ${select.join(', ')}`,
    `FROM jsonb_to_recordset($1::jsonb) AS r(${[...BASE_INPUT, ...spec.input].join(', ')})`,
    ...(spec.joins ?? []),
    `ON CONFLICT (flexi_id) DO UPDATE SET ${updates.join(', ')}`,
  ].join('\n');
}

/** Recomputes product stock totals from the period's cards (only rows that change). */
export const REFRESH_STOCK_SQL = `
WITH totals AS (
  SELECT k.cenik_id, sum(k.stav_mj) AS stav, sum(k.dostup_mj) AS dostup, sum(k.rezerv_mj) AS rezer
  FROM flexi_skladova_karta k
  JOIN flexi_ucetni_obdobi o ON o.id = k.ucetni_obdobi_id
  WHERE o.flexi_id = $1
  GROUP BY k.cenik_id
), target AS (
  SELECT c.id, coalesce(t.stav, 0) AS stav, coalesce(t.dostup, 0) AS dostup, coalesce(t.rezer, 0) AS rezer
  FROM flexi_cenik c LEFT JOIN totals t ON t.cenik_id = c.id
)
UPDATE flexi_cenik c
SET sum_stav_mj = target.stav, sum_dostup_mj = target.dostup, sum_rezer_mj = target.rezer
FROM target
WHERE c.id = target.id
  AND (c.sum_stav_mj, c.sum_dostup_mj, c.sum_rezer_mj)
      IS DISTINCT FROM (target.stav, target.dostup, target.rezer)`;

/** Appends a history row for each live product whose total differs from its last one. */
export const STOCK_HISTORY_SQL = `
INSERT INTO flexi_cenik_stav_historie (cenik_id, plati_od, stav_mj)
SELECT c.id, $1::timestamptz, c.sum_stav_mj
FROM flexi_cenik c
LEFT JOIN LATERAL (
  SELECT h.stav_mj FROM flexi_cenik_stav_historie h
  WHERE h.cenik_id = c.id ORDER BY h.plati_od DESC LIMIT 1
) last ON true
WHERE c.deleted_at IS NULL AND (last.stav_mj IS NULL OR last.stav_mj <> c.sum_stav_mj)
ON CONFLICT DO NOTHING`;


/**
 * Rebuilds the stock history backwards from movement deltas ($1: jsonb
 * [{cenik_flexi_id, day, delta}], $2: `since` date). For every live product a
 * row at `since` (stock before every movement in the window), and for each
 * movement day D a row from the next midnight in Prague with
 * "current stock − changes after D". Rows at or after a product's first
 * existing history row are skipped, so the history from real syncs stays.
 */
export const BACKFILL_HISTORY_SQL = `
WITH d AS (
  SELECT c.id AS cenik_id, r.day, r.delta
  FROM jsonb_to_recordset($1::jsonb) AS r(cenik_flexi_id int, day date, delta numeric)
  JOIN flexi_cenik c ON c.flexi_id = r.cenik_flexi_id
), first AS (
  SELECT cenik_id, min(plati_od) AS first_at FROM flexi_cenik_stav_historie GROUP BY cenik_id
), points AS (
  SELECT c.id AS cenik_id, $2::date AS valid_from, ($2::date - 1) AS after_day
  FROM flexi_cenik c WHERE c.deleted_at IS NULL
  UNION
  SELECT cenik_id, day + 1, day FROM d
), vals AS (
  SELECT p.cenik_id,
         (p.valid_from::timestamp AT TIME ZONE 'Europe/Prague') AS plati_od,
         c.sum_stav_mj - coalesce(
           (SELECT sum(d2.delta) FROM d d2 WHERE d2.cenik_id = p.cenik_id AND d2.day > p.after_day), 0
         ) AS stav
  FROM points p JOIN flexi_cenik c ON c.id = p.cenik_id
)
INSERT INTO flexi_cenik_stav_historie (cenik_id, plati_od, stav_mj)
SELECT v.cenik_id, v.plati_od, v.stav
FROM vals v LEFT JOIN first f ON f.cenik_id = v.cenik_id
WHERE f.first_at IS NULL OR v.plati_od < f.first_at
ON CONFLICT DO NOTHING`;
