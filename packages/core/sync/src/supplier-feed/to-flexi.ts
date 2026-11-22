import { z } from 'zod';

/**
 * Supplier feed item → ABRA Flexi `cenik` (products page "Založit ve Flexi" and
 * "Aktualizovat ve Flexi"). Pure: the API does the writes and the pairing.
 *
 * - A created product carries `id: ext:FEED:<supplier_feed_item.id>`, so a
 *   repeated create updates the same record instead of duplicating it.
 * - Its `kod` is suggested from the name and the supplier's code and can be
 *   edited before the write.
 * - The price is the feed's retail price incl. VAT (cenaZakl, typ ceny s DPH).
 * - The feed's images go along as link attachments (`prilohy`, typ odkaz),
 *   each with `ext:FEEDIMG:<item id>:<url hash>`, and only those the product
 *   doesn't link yet.
 */

/** Field limits from /c/{firma}/cenik/properties.json. */
export const FLEXI_CENIK_LIMITS = { kod: 64, nazev: 255, eanKod: 20 } as const;

/** Items per create/update request (and per Flexi PUT, which is atomic). */
export const FEED_FLEXI_MAX_ITEMS = 200;

/** Images per product sent to Flexi (the first ones of the feed). */
export const FEED_FLEXI_MAX_IMAGES = 10;

/** Upper case, no diacritics, anything but letters and digits → "_". */
export function kodPart(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/**
 * "kuličky z dutého vlákna 0,5 kg" + "1000" → "KULICKY_Z_DUTEHO_VLAKNA_0_5_KG_1000".
 * The supplier's code always stays whole at the end; the name is shortened to fit 64.
 */
export function suggestFlexiKod(nazev: string | null, kod: string): string {
  const max = FLEXI_CENIK_LIMITS.kod;
  const suffix = kodPart(kod) || 'X';
  if (suffix.length >= max - 1) return suffix.slice(0, max);
  const name = kodPart(nazev ?? '')
    .slice(0, max - suffix.length - 1)
    .replace(/_+$/, '');
  return name ? `${name}_${suffix}` : suffix;
}

/** A Flexi code the user may type: what suggestFlexiKod produces, plus "-" and ".". */
export const flexiKodSchema = z
  .string()
  .trim()
  .min(1)
  .max(FLEXI_CENIK_LIMITS.kod)
  .regex(/^[A-Z0-9_.-]+$/);

export const feedFlexiCreateInput = z
  .object({
    items: z
      .array(z.object({ id: z.uuid(), kod: z.string() }).strict())
      .min(1)
      .max(FEED_FLEXI_MAX_ITEMS),
    /** Validate only (dry-run), whatever FLEXI_DRY_RUN says. */
    check: z.boolean().default(false),
  })
  .strict();
export type FeedFlexiCreateInput = z.infer<typeof feedFlexiCreateInput>;

/** Fields the feed may update on a product already in Flexi. */
export const FEED_SYNC_FIELDS = [
  'nazev',
  'cena',
  'sazbaDph',
  'eanKod',
  'popis',
  'kratkyPopis',
  'dodaciLhuta',
  'hmotnost',
  'obrazky',
] as const;
export type FeedSyncField = (typeof FEED_SYNC_FIELDS)[number];

export const feedFlexiUpdateInput = z
  .object({
    items: z.array(z.uuid()).min(1).max(FEED_FLEXI_MAX_ITEMS),
    fields: z.array(z.enum(FEED_SYNC_FIELDS)).min(1),
    check: z.boolean().default(false),
  })
  .strict();
export type FeedFlexiUpdateInput = z.infer<typeof feedFlexiUpdateInput>;

/** What the mapping needs of a `supplier_feed_item` (decimals as strings). */
export interface FeedItemForFlexi {
  id: string;
  kod: string;
  nazev: string | null;
  eanKod: string | null;
  popis: string | null;
  kratkyPopis: string | null;
  cenaBezna: string | null;
  szbDph: string | null;
  dodaciLhuta: string | null;
  hmotnostNetto: string | null;
  /** Image URLs, the main one first. */
  obrazky: string[];
}

/** The paired product as mirrored in `flexi_cenik`. */
export interface CenikForFeed {
  flexiId: number;
  kod: string;
  nazev: string;
  eanKod: string | null;
  popis: string | null;
  kratkyPopis: string | null;
  /** Price incl. VAT, whatever price type the product uses. */
  cenaZaklVcDph: string | null;
  typSazbyDph: string | null;
  dodaciLhuta: string | null;
  hmotnostNetto: string | null;
  /** Links of the product's link attachments (`priloha.link`). */
  odkazy: string[];
  /** The product already has a main attachment (a link or an uploaded file). */
  maHlavniPrilohu: boolean;
}

/** Why an item can't be written; shown translated in the web app. */
export type FeedFlexiProblem =
  | 'notFound'
  | 'alreadyLinked'
  | 'notLinked'
  | 'kodInvalid'
  | 'kodDuplicate'
  | 'kodExists'
  | 'noName'
  | 'vatUnknown'
  | 'noChanges'
  /** Flexi rejected another item of the same request, so nothing of it was saved. */
  | 'batchFailed'
  /** Flexi didn't answer or failed (5xx, network). */
  | 'flexiUnavailable';

export class FeedFlexiError extends Error {
  constructor(public readonly problem: FeedFlexiProblem) {
    super(problem);
    this.name = 'FeedFlexiError';
  }
}

export const feedItemExtId = (itemId: string) => `ext:FEED:${itemId}`;

/** VAT percent from the feed → Flexi rate (CZ: 21 base, 12 reduced). */
export function feedVatRate(szbDph: string | null): 'dphZakl' | 'dphSniz' | 'dphSniz2' | 'dphOsv' | null {
  if (szbDph === null || szbDph.trim() === '') return null;
  const n = Number(szbDph);
  if (n === 21) return 'dphZakl';
  if (n === 12 || n === 15) return 'dphSniz';
  if (n === 10) return 'dphSniz2';
  if (n === 0) return 'dphOsv';
  return null;
}

const text = (s: string | null) => (s === null || s.trim() === '' ? null : s.trim());
const num = (s: string | null) => (s === null || s.trim() === '' ? null : String(Number(s)));
const ean = (s: string | null) => {
  const v = text(s);
  return v && v.length <= FLEXI_CENIK_LIMITS.eanKod ? v : null;
};
const nazev = (item: FeedItemForFlexi) => text(item.nazev)?.slice(0, FLEXI_CENIK_LIMITS.nazev) ?? null;

/** The feed's usable image URLs (http/https), without repeats, at most FEED_FLEXI_MAX_IMAGES. */
export function feedImages(item: FeedItemForFlexi): string[] {
  const out: string[] = [];
  for (const raw of item.obrazky) {
    const u = raw.trim();
    if (!/^https?:\/\/\S+$/i.test(u) || out.includes(u)) continue;
    try {
      new URL(u);
    } catch {
      continue;
    }
    out.push(u);
    if (out.length === FEED_FLEXI_MAX_IMAGES) break;
  }
  return out;
}

/** FNV-1a, 32 bit, as 8 hex chars: a stable id part for a URL (works in the browser too). */
function urlHash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

const IMAGE_TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  avif: 'image/avif',
  svg: 'image/svg+xml',
};

/**
 * A link attachment (`priloha`, nested in `cenik.prilohy`). Flexi sets
 * typK = typPrilohy.odkaz itself when `link` is filled; nazSoub and
 * contentType are required. The name follows Flexi's own "host - file".
 */
export function buildImageLink(itemId: string, url: string, main: boolean): Record<string, string> {
  const u = new URL(url);
  const last = u.pathname.split('/').pop() ?? '';
  let file = last;
  try {
    file = decodeURIComponent(last);
  } catch {
    // A malformed %-sequence from the feed: keep the raw segment.
  }
  file ||= 'obrazek';
  const ext = file.includes('.') ? file.split('.').pop()!.toLowerCase() : '';
  const r: Record<string, string> = {
    id: `ext:FEEDIMG:${itemId}:${urlHash(url)}`,
    nazSoub: `${u.host} - ${file}`.slice(0, 255),
    contentType: IMAGE_TYPES[ext] ?? 'content/unknown',
    link: url,
    linkPicture: 'true',
  };
  if (main) r.mainAttachment = 'true';
  return r;
}

/** Feed images the product doesn't link yet. */
const missingImages = (item: FeedItemForFlexi, cenik: CenikForFeed) => {
  const have = new Set(cenik.odkazy.map((l) => l.trim()));
  return feedImages(item).filter((u) => !have.has(u));
};

/** The new `cenik` record for PUT /c/{firma}/cenik.json. Throws FeedFlexiError. */
export function buildCenikCreate(item: FeedItemForFlexi, kod: string): Record<string, unknown> {
  const parsedKod = flexiKodSchema.safeParse(kod);
  if (!parsedKod.success) throw new FeedFlexiError('kodInvalid');
  const name = nazev(item);
  if (!name) throw new FeedFlexiError('noName');
  const vat = feedVatRate(item.szbDph);
  if (!vat) throw new FeedFlexiError('vatUnknown');

  const r: Record<string, string> = {
    id: feedItemExtId(item.id),
    kod: parsedKod.data,
    nazev: name,
    typZasobyK: 'typZasoby.zbozi',
    skladove: 'true',
    typCenyDphK: 'typCeny.sDph',
    typSzbDphK: `typSzbDph.${vat}`,
  };
  const optional: [string, string | null][] = [
    ['cenaZakl', num(item.cenaBezna)],
    ['eanKod', ean(item.eanKod)],
    ['popis', text(item.popis)],
    ['kratkyPopis', text(item.kratkyPopis)],
    ['dodaciLhuta', num(item.dodaciLhuta)],
    ['hmotMj', num(item.hmotnostNetto)],
  ];
  for (const [k, v] of optional) if (v !== null) r[k] = v;
  const images = feedImages(item);
  if (images.length === 0) return r;
  return { ...r, prilohy: images.map((u, i) => buildImageLink(item.id, u, i === 0)) };
}

export interface FeedFieldChange {
  field: FeedSyncField;
  flexi: string | null;
  feed: string;
}

const sameNumber = (a: string | null, b: string, decimals: number) =>
  a !== null && Number(a).toFixed(decimals) === Number(b).toFixed(decimals);

/**
 * Where the feed differs from the paired product. A value missing in the feed
 * is never a change: the feed doesn't clear what Flexi has.
 */
export function feedItemChanges(item: FeedItemForFlexi, cenik: CenikForFeed): FeedFieldChange[] {
  const out: FeedFieldChange[] = [];
  const add = (field: FeedSyncField, flexi: string | null, feed: string | null, same: (f: string) => boolean) => {
    if (feed !== null && !same(feed)) out.push({ field, flexi, feed });
  };
  const name = nazev(item);
  add('nazev', cenik.nazev, name, (f) => f === cenik.nazev.trim());
  add('cena', cenik.cenaZaklVcDph, num(item.cenaBezna), (f) => sameNumber(cenik.cenaZaklVcDph, f, 2));
  add('sazbaDph', cenik.typSazbyDph, feedVatRate(item.szbDph), (f) => f === cenik.typSazbyDph);
  add('eanKod', cenik.eanKod, ean(item.eanKod), (f) => f === text(cenik.eanKod));
  add('popis', cenik.popis, text(item.popis), (f) => f === text(cenik.popis));
  add('kratkyPopis', cenik.kratkyPopis, text(item.kratkyPopis), (f) => f === text(cenik.kratkyPopis));
  add('dodaciLhuta', cenik.dodaciLhuta, num(item.dodaciLhuta), (f) => sameNumber(cenik.dodaciLhuta, f, 2));
  add('hmotnost', cenik.hmotnostNetto, num(item.hmotnostNetto), (f) => sameNumber(cenik.hmotnostNetto, f, 3));
  // Images are only ever added: `feed` lists the missing ones, one per line.
  const missing = missingImages(item, cenik);
  if (missing.length > 0) {
    out.push({ field: 'obrazky', flexi: cenik.odkazy.length ? cenik.odkazy.join('\n') : null, feed: missing.join('\n') });
  }
  return out;
}

/** The `cenik` update with the chosen fields that differ. Throws FeedFlexiError('noChanges'). */
export function buildCenikFeedUpdate(
  item: FeedItemForFlexi,
  cenik: CenikForFeed,
  fields: readonly FeedSyncField[],
): Record<string, unknown> {
  const changes = feedItemChanges(item, cenik).filter((c) => fields.includes(c.field));
  if (changes.length === 0) throw new FeedFlexiError('noChanges');
  const r: Record<string, unknown> = { id: String(cenik.flexiId) };
  for (const c of changes) {
    switch (c.field) {
      case 'nazev':
        r.nazev = c.feed;
        break;
      case 'cena':
        // The feed's price includes VAT, so the product's price type follows it.
        r.typCenyDphK = 'typCeny.sDph';
        r.cenaZakl = c.feed;
        break;
      case 'sazbaDph':
        r.typSzbDphK = `typSzbDph.${c.feed}`;
        break;
      case 'hmotnost':
        r.hmotMj = c.feed;
        break;
      case 'obrazky':
        // Nested attachments are added; Flexi keeps the product's others. The
        // first one becomes main only when the product has no main attachment.
        r.prilohy = missingImages(item, cenik).map((u, i) => buildImageLink(item.id, u, i === 0 && !cenik.maHlavniPrilohu));
        break;
      default:
        r[c.field] = c.feed;
    }
  }
  return r;
}
