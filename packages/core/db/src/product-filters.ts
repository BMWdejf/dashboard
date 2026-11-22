import { MJ_ZARUKY, TYP_CENY_DPH, TYP_SAZBY_DPH, TYP_ZASOBY } from './flexi';

/**
 * Filters of the Products table: which fields of `flexi_cenik` can be
 * filtered, and how a filter is written in the URL (`f.<key>=<value>`).
 * Pure and without Prisma, so the web's client components can import it
 * (`@repo/core-db/product-filters`). The SQL is in product-filters-sql.ts.
 *
 * URL values per kind:
 * - text: `contains:abc`, `equals:abc`, `empty`, `notEmpty`
 * - number: `10..20`, `10..`, `..20`; date: `2026-01-01..2026-01-31` (Prague days, inclusive)
 * - bool: `true` / `false`
 * - enum, ref, tags: `a,b` (any of them); ref also takes `none` (= not set)
 */

export type FilterKind = 'text' | 'number' | 'date' | 'bool' | 'enum' | 'ref' | 'tags';
export type FilterGroup = 'identity' | 'classification' | 'prices' | 'stock' | 'logistics' | 'dates';
/** Where a ref's options come from (getProductFilterOptions). */
export type RefSource = 'groups' | 'units';

export const STOCK_STATUSES = ['inStock', 'lowStock', 'outOfStock', 'service'] as const;

interface FieldDef {
  key: string;
  kind: FilterKind;
  group: FilterGroup;
  options?: readonly string[];
  source?: RefSource;
}

export const PRODUCT_FILTER_FIELDS = [
  { key: 'nazev', kind: 'text', group: 'identity' },
  { key: 'kod', kind: 'text', group: 'identity' },
  { key: 'eanKod', kind: 'text', group: 'identity' },
  { key: 'flexiId', kind: 'number', group: 'identity' },
  { key: 'popis', kind: 'text', group: 'identity' },
  { key: 'kratkyPopis', kind: 'text', group: 'identity' },
  { key: 'klicSlova', kind: 'text', group: 'identity' },
  { key: 'techParam', kind: 'text', group: 'identity' },
  { key: 'hasImage', kind: 'bool', group: 'identity' },

  { key: 'typZasoby', kind: 'enum', group: 'classification', options: TYP_ZASOBY },
  { key: 'skupinaZbozi', kind: 'ref', group: 'classification', source: 'groups' },
  { key: 'skladove', kind: 'bool', group: 'classification' },
  { key: 'exportNaEshop', kind: 'bool', group: 'classification' },
  { key: 'stitky', kind: 'tags', group: 'classification' },
  { key: 'mj1', kind: 'ref', group: 'classification', source: 'units' },
  { key: 'platiOdRok', kind: 'number', group: 'classification' },
  { key: 'platiDoRok', kind: 'number', group: 'classification' },

  { key: 'cenaZaklVcDph', kind: 'number', group: 'prices' },
  { key: 'cenaZaklBezDph', kind: 'number', group: 'prices' },
  { key: 'cenaZakl', kind: 'number', group: 'prices' },
  { key: 'cenaBezna', kind: 'number', group: 'prices' },
  { key: 'nakupCena', kind: 'number', group: 'prices' },
  { key: 'typCenyDph', kind: 'enum', group: 'prices', options: TYP_CENY_DPH },
  { key: 'typSazbyDph', kind: 'enum', group: 'prices', options: TYP_SAZBY_DPH },
  { key: 'szbDph', kind: 'number', group: 'prices' },

  { key: 'status', kind: 'enum', group: 'stock', options: STOCK_STATUSES },
  { key: 'sumStavMj', kind: 'number', group: 'stock' },
  { key: 'sumDostupMj', kind: 'number', group: 'stock' },
  { key: 'sumRezerMj', kind: 'number', group: 'stock' },
  { key: 'evidSarze', kind: 'bool', group: 'stock' },
  { key: 'evidExpirace', kind: 'bool', group: 'stock' },

  { key: 'zaruka', kind: 'number', group: 'logistics' },
  { key: 'mjZaruky', kind: 'enum', group: 'logistics', options: MJ_ZARUKY },
  { key: 'dodaciLhuta', kind: 'number', group: 'logistics' },
  { key: 'mjDodaciLhuty', kind: 'ref', group: 'logistics', source: 'units' },
  { key: 'hmotnostNetto', kind: 'number', group: 'logistics' },
  { key: 'mjHmotnosti', kind: 'ref', group: 'logistics', source: 'units' },

  { key: 'lastUpdate', kind: 'date', group: 'dates' },
  { key: 'flexiCreatedAt', kind: 'date', group: 'dates' },
  { key: 'syncedAt', kind: 'date', group: 'dates' },
] as const satisfies readonly FieldDef[];

export type ProductFilterField = (typeof PRODUCT_FILTER_FIELDS)[number];
export type ProductFilterKey = ProductFilterField['key'];
type KeyOf<K extends FilterKind> = Extract<ProductFilterField, { kind: K }>['key'];

export const FILTER_GROUPS: readonly FilterGroup[] = [
  'identity',
  'classification',
  'prices',
  'stock',
  'logistics',
  'dates',
];

export const TEXT_OPS = ['contains', 'equals', 'empty', 'notEmpty'] as const;
export type TextOp = (typeof TEXT_OPS)[number];

export type ProductFilter =
  | { key: KeyOf<'text'>; kind: 'text'; op: TextOp; value: string }
  | { key: KeyOf<'number'>; kind: 'number'; min: number | null; max: number | null }
  | { key: KeyOf<'date'>; kind: 'date'; from: string | null; to: string | null }
  | { key: KeyOf<'bool'>; kind: 'bool'; value: boolean }
  | { key: KeyOf<'enum'>; kind: 'enum'; values: string[] }
  | { key: KeyOf<'ref'>; kind: 'ref'; values: string[] }
  | { key: KeyOf<'tags'>; kind: 'tags'; values: string[] };

export const FILTER_PARAM_PREFIX = 'f.';
/** Value of a ref filter that matches products without that reference. */
export const REF_NONE = 'none';

const MAX_TEXT = 100;
const MAX_VALUES = 50;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

const FIELDS = new Map<string, ProductFilterField>(PRODUCT_FILTER_FIELDS.map((f) => [f.key, f]));

export function filterField(key: string): ProductFilterField | undefined {
  return FIELDS.get(key);
}

function isDay(s: string): boolean {
  if (!DAY.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(s);
}

function num(s: string): number | null | undefined {
  if (s === '') return null;
  const n = Number(s.replace(',', '.'));
  return Number.isFinite(n) ? n : undefined;
}

/** One filter from its URL value; null when the value isn't valid. */
export function decodeFilter(key: string, raw: string): ProductFilter | null {
  const field = FIELDS.get(key);
  if (!field) return null;
  const v = raw.trim();
  switch (field.kind) {
    case 'text': {
      if (v === 'empty' || v === 'notEmpty') return { key: field.key, kind: 'text', op: v, value: '' };
      const i = v.indexOf(':');
      const op = v.slice(0, i);
      const value = v.slice(i + 1).trim().slice(0, MAX_TEXT);
      if (i < 0 || (op !== 'contains' && op !== 'equals') || !value) return null;
      return { key: field.key, kind: 'text', op, value };
    }
    case 'number': {
      const [a, b, ...rest] = v.split('..');
      if (b === undefined || rest.length) return null;
      const min = num(a!.trim());
      const max = num(b.trim());
      if (min === undefined || max === undefined || (min === null && max === null)) return null;
      return min !== null && max !== null && min > max
        ? { key: field.key, kind: 'number', min: max, max: min }
        : { key: field.key, kind: 'number', min, max };
    }
    case 'date': {
      const [a, b, ...rest] = v.split('..');
      if (b === undefined || rest.length) return null;
      const from = a!.trim() || null;
      const to = b.trim() || null;
      if ((from && !isDay(from)) || (to && !isDay(to)) || (!from && !to)) return null;
      return from && to && from > to
        ? { key: field.key, kind: 'date', from: to, to: from }
        : { key: field.key, kind: 'date', from, to };
    }
    case 'bool':
      return v === 'true' || v === 'false' ? { key: field.key, kind: 'bool', value: v === 'true' } : null;
    case 'enum':
    case 'ref':
    case 'tags': {
      const values = [...new Set(v.split(',').map((x) => x.trim()).filter(Boolean))].slice(0, MAX_VALUES);
      const ok =
        field.kind === 'enum'
          ? values.every((x) => (field.options as readonly string[]).includes(x))
          : field.kind === 'ref'
            ? values.every((x) => x === REF_NONE || UUID.test(x))
            : values.every((x) => x.length <= MAX_TEXT);
      if (!values.length || !ok) return null;
      return { key: field.key, kind: field.kind, values } as ProductFilter;
    }
  }
}

/** The filter's URL value (inverse of decodeFilter). */
export function encodeFilter(f: ProductFilter): string {
  switch (f.kind) {
    case 'text':
      return f.op === 'empty' || f.op === 'notEmpty' ? f.op : `${f.op}:${f.value}`;
    case 'number':
      return `${f.min ?? ''}..${f.max ?? ''}`;
    case 'date':
      return `${f.from ?? ''}..${f.to ?? ''}`;
    case 'bool':
      return String(f.value);
    default:
      return f.values.join(',');
  }
}

/**
 * The valid filters in a page's search params, in the fields' order. Unknown
 * keys and invalid values are dropped; a key given twice uses its first value.
 */
export function parseProductFilters(
  params: Record<string, string | string[] | undefined> | URLSearchParams,
): ProductFilter[] {
  const get = (name: string): string | undefined => {
    if (params instanceof URLSearchParams) return params.get(name) ?? undefined;
    const v = params[name];
    return Array.isArray(v) ? v[0] : v;
  };
  const out: ProductFilter[] = [];
  for (const field of PRODUCT_FILTER_FIELDS) {
    const raw = get(FILTER_PARAM_PREFIX + field.key);
    if (raw === undefined) continue;
    const f = decodeFilter(field.key, raw);
    if (f) out.push(f);
  }
  return out;
}

/** Sets the filters on a copy of `params`, replacing every earlier `f.*`. */
export function withFilters(params: URLSearchParams, filters: readonly ProductFilter[]): URLSearchParams {
  const next = new URLSearchParams();
  for (const [k, v] of params) if (!k.startsWith(FILTER_PARAM_PREFIX)) next.append(k, v);
  for (const f of filters) next.set(FILTER_PARAM_PREFIX + f.key, encodeFilter(f));
  return next;
}
