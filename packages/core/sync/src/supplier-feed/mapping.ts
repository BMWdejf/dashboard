import { z } from 'zod';

/**
 * Supplier feed mapping: which XML tag of an item goes into which column of
 * `supplier_feed_item` (named like `flexi_cenik`). Pure; no saxes, no fetch,
 * so the web app's mapping screen can import it (`@repo/core-sync/feed-mapping`).
 *
 * Tags are paths inside one item: `ITEM_ID`, `DELIVERY/DELIVERY_ID`, `@id`
 * (an attribute of the item element) and `PARAM[Barva]` (a Heureka
 * PARAM_NAME/VAL pair, grouped by name ignoring case).
 */

export type FeedValueKind = 'text' | 'html' | 'decimal' | 'percent' | 'url' | 'urls' | 'attribute';

export interface FeedTarget {
  /** Column (camelCase, as in the Prisma model). */
  key: FeedTargetKey;
  kind: FeedValueKind;
  /** More than one tag may map here (images, attributes). */
  multi: boolean;
  /** varchar limit; longer text is cut. */
  maxLength?: number;
}

export const FEED_TARGET_KEYS = [
  'kod',
  'nazev',
  'eanKod',
  'kodVyrobce',
  'vyrobce',
  'popis',
  'kratkyPopis',
  'cenaBezna',
  'nakupCena',
  'szbDph',
  'sumStavMj',
  'dodaciLhuta',
  'hmotnostNetto',
  'kategorie',
  'url',
  'obrazky',
  'skupinaVariant',
  'atribut',
] as const;
export type FeedTargetKey = (typeof FEED_TARGET_KEYS)[number];

/** In the order the mapping screen offers them. */
export const FEED_TARGETS: readonly FeedTarget[] = [
  { key: 'kod', kind: 'text', multi: false, maxLength: 255 },
  { key: 'nazev', kind: 'text', multi: false, maxLength: 255 },
  { key: 'eanKod', kind: 'text', multi: false, maxLength: 64 },
  { key: 'kodVyrobce', kind: 'text', multi: false, maxLength: 255 },
  { key: 'vyrobce', kind: 'text', multi: false, maxLength: 255 },
  { key: 'popis', kind: 'html', multi: false },
  { key: 'kratkyPopis', kind: 'text', multi: false },
  { key: 'cenaBezna', kind: 'decimal', multi: false },
  { key: 'nakupCena', kind: 'decimal', multi: false },
  { key: 'szbDph', kind: 'percent', multi: false },
  { key: 'sumStavMj', kind: 'decimal', multi: false },
  { key: 'dodaciLhuta', kind: 'decimal', multi: false },
  { key: 'hmotnostNetto', kind: 'decimal', multi: false },
  { key: 'kategorie', kind: 'text', multi: false },
  { key: 'url', kind: 'url', multi: false },
  { key: 'obrazky', kind: 'urls', multi: true },
  { key: 'skupinaVariant', kind: 'text', multi: false, maxLength: 255 },
  { key: 'atribut', kind: 'attribute', multi: true },
];

const TARGET = new Map(FEED_TARGETS.map((t) => [t.key, t]));

/** The primary key and the name must be mapped. */
export const REQUIRED_TARGETS: readonly FeedTargetKey[] = ['kod', 'nazev'];

/** Tag → target; a tag left out is not imported. */
export const feedMapping = z
  .record(z.string().min(1).max(300), z.enum(FEED_TARGET_KEYS))
  .refine((m) => Object.keys(m).length <= 500, 'Too many tags.');
export type FeedMapping = z.infer<typeof feedMapping>;

export type FeedMappingIssue =
  | { code: 'missing'; target: FeedTargetKey }
  | { code: 'duplicate'; target: FeedTargetKey; tags: string[] }
  | { code: 'unknownTag'; tag: string };

/**
 * Problems that block saving: a required target not mapped, a single-value
 * target mapped from two tags, or a tag the feed doesn't have (when `tags`
 * is given).
 */
export function validateFeedMapping(mapping: FeedMapping, tags?: readonly string[]): FeedMappingIssue[] {
  const issues: FeedMappingIssue[] = [];
  const byTarget = new Map<FeedTargetKey, string[]>();
  for (const [tag, target] of Object.entries(mapping)) {
    byTarget.set(target, [...(byTarget.get(target) ?? []), tag]);
  }
  for (const target of REQUIRED_TARGETS) {
    if (!byTarget.has(target)) issues.push({ code: 'missing', target });
  }
  for (const [target, from] of byTarget) {
    if (from.length > 1 && !TARGET.get(target)?.multi) issues.push({ code: 'duplicate', target, tags: from });
  }
  if (tags) {
    const known = new Set(tags);
    for (const tag of Object.keys(mapping)) if (!known.has(tag)) issues.push({ code: 'unknownTag', tag });
  }
  return issues;
}

/**
 * Tag names of the common formats (Heureka, Zboží.cz, Google Merchant,
 * Mergado), lower case, without a namespace prefix. The first match wins for
 * a single-value target.
 */
const ALIASES: [FeedTargetKey, string[]][] = [
  ['kod', ['item_id', 'id', 'code', 'sku']],
  ['nazev', ['productname', 'title', 'name_exact', 'product', 'name']],
  ['eanKod', ['ean', 'gtin', 'barcode']],
  ['kodVyrobce', ['productno', 'mpn', 'product_no']],
  ['vyrobce', ['manufacturer', 'brand', 'producer']],
  ['popis', ['description']],
  ['kratkyPopis', ['short_description', 'description_short']],
  ['cenaBezna', ['price_vat', 'price', 'sale_price']],
  ['nakupCena', ['purchase_price', 'wholesale_price', 'price_purchase']],
  ['szbDph', ['vat', 'vat_rate']],
  ['sumStavMj', ['stock_quantity', 'stock/amount', 'quantity', 'stock']],
  ['dodaciLhuta', ['delivery_date', 'delivery_days']],
  ['hmotnostNetto', ['weight', 'shipping_weight']],
  ['kategorie', ['categorytext', 'product_type', 'category', 'google_product_category']],
  ['url', ['url', 'link']],
  ['obrazky', ['imgurl', 'imgurl_alternative', 'image_link', 'additional_image_link', 'image']],
  ['skupinaVariant', ['itemgroup_id', 'item_group_id']],
];

const bare = (tag: string) => tag.replace(/^@/, '').replace(/^[a-z]+:/i, '').toLowerCase();

/** A first guess for the mapping screen: known tag names, and every PARAM as an attribute. */
export function defaultFeedMapping(tags: readonly string[]): FeedMapping {
  const out: FeedMapping = {};
  const taken = new Set<FeedTargetKey>();
  for (const [target, names] of ALIASES) {
    const multi = TARGET.get(target)!.multi;
    for (const name of names) {
      for (const tag of tags) {
        if (out[tag] || bare(tag) !== name) continue;
        if (!multi && taken.has(target)) continue;
        out[tag] = target;
        taken.add(target);
      }
    }
  }
  for (const tag of tags) if (!out[tag] && tag.startsWith('PARAM[')) out[tag] = 'atribut';
  return out;
}

/** "PARAM[Barva]" → "Barva"; other tags keep their last path segment. */
export function attributeName(tag: string): string {
  const param = /^PARAM\[(.+)\]$/.exec(tag);
  if (param) return param[1]!;
  return tag.split('/').pop()!.replace(/^@/, '');
}

/**
 * "489,00" → "489.00", "1 234,5 Kč" → "1234.5", "1,234.50" → "1234.50";
 * null when it isn't a number. Strings, so Decimal columns keep every digit.
 */
export function parseDecimal(value: string): string | null {
  let s = value.replace(/[\s\u00a0\u202f]/g, '').replace(/[^\d.,-]/g, '');
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma >= 0 && lastDot >= 0) {
    // The later separator is the decimal one; the other groups thousands.
    s = lastComma > lastDot ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (lastComma >= 0) {
    s = s.split(',').length > 2 ? s.replace(/,/g, '') : s.replace(',', '.');
  } else if (s.split('.').length > 2) {
    s = s.replace(/\./g, '');
  }
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  // numeric(20,6): at most 14 integer digits.
  if (s.replace(/^-/, '').split('.')[0]!.length > 14) return null;
  return s;
}

const isUrl = (s: string) => {
  try {
    const u = new URL(s);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
};

const cleanText = (s: string, max?: number) => {
  const t = s.replace(/\s+/g, ' ').trim();
  return max && t.length > max ? t.slice(0, max) : t;
};

/** One item's tags: tag → values in document order. */
export type FeedRecord = Record<string, string[]>;

/** A row for `supplier_feed_item` (decimals as strings). */
export interface SupplierFeedItemRow {
  kod: string;
  nazev: string | null;
  eanKod: string | null;
  kodVyrobce: string | null;
  vyrobce: string | null;
  popis: string | null;
  kratkyPopis: string | null;
  cenaBezna: string | null;
  nakupCena: string | null;
  szbDph: string | null;
  sumStavMj: string | null;
  dodaciLhuta: string | null;
  hmotnostNetto: string | null;
  kategorie: string | null;
  url: string | null;
  obrazky: string[];
  skupinaVariant: string | null;
  atributy: Record<string, string>;
  /** The tags the mapping leaves out. */
  raw: FeedRecord;
}

export type MappedItem =
  | { ok: true; row: SupplierFeedItemRow; invalid: FeedTargetKey[] }
  | { ok: false; reason: 'noKey' };

const EMPTY: Omit<SupplierFeedItemRow, 'kod' | 'raw'> = {
  nazev: null,
  eanKod: null,
  kodVyrobce: null,
  vyrobce: null,
  popis: null,
  kratkyPopis: null,
  cenaBezna: null,
  nakupCena: null,
  szbDph: null,
  sumStavMj: null,
  dodaciLhuta: null,
  hmotnostNetto: null,
  kategorie: null,
  url: null,
  obrazky: [],
  skupinaVariant: null,
  atributy: {},
};

/**
 * Applies the mapping to one item. An item without a primary key is
 * rejected; a value that doesn't fit its column (a price that isn't a number,
 * a URL that isn't http(s)) becomes null and is reported in `invalid`.
 */
export function mapFeedItem(record: FeedRecord, mapping: FeedMapping): MappedItem {
  const row: Omit<SupplierFeedItemRow, 'kod'> & { kod: string | null } = {
    ...EMPTY,
    obrazky: [],
    atributy: {},
    kod: null,
    raw: {},
  };
  const invalid = new Set<FeedTargetKey>();
  for (const [tag, values] of Object.entries(record)) {
    const key = mapping[tag];
    if (!key) {
      row.raw[tag] = values;
      continue;
    }
    const target = TARGET.get(key)!;
    const present = values.map((v) => v.trim()).filter((v) => v !== '');
    if (present.length === 0) continue;
    const first = present[0]!;
    switch (target.kind) {
      case 'text': {
        (row as Record<string, unknown>)[key] = cleanText(first, target.maxLength);
        break;
      }
      case 'html':
        (row as Record<string, unknown>)[key] = first;
        break;
      case 'decimal':
      case 'percent': {
        const n = parseDecimal(target.kind === 'percent' ? first.replace('%', '') : first);
        if (n === null) invalid.add(key);
        (row as Record<string, unknown>)[key] = n;
        break;
      }
      case 'url':
        if (isUrl(first)) row.url = first;
        else invalid.add(key);
        break;
      case 'urls':
        for (const v of present) {
          if (!isUrl(v)) invalid.add(key);
          else if (!row.obrazky.includes(v)) row.obrazky.push(v);
        }
        break;
      case 'attribute':
        row.atributy[attributeName(tag)] = present.map((v) => cleanText(v)).join(', ');
        break;
    }
  }
  if (row.szbDph !== null && Math.abs(Number(row.szbDph)) >= 1000) {
    row.szbDph = null;
    invalid.add('szbDph');
  }
  if (!row.kod) return { ok: false, reason: 'noKey' };
  return { ok: true, row: row as SupplierFeedItemRow, invalid: [...invalid] };
}
