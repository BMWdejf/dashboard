/**
 * ABRA Flexi records → rows of the Neon mirror (tables `flexi_*` in @repo/core-db).
 *
 * Pure functions: no I/O, no clock. References to other records stay as Flexi
 * internal ids (`…FlexiId`); the store resolves them to our UUIDs when writing.
 *
 * What Flexi sends (JSON, checked on the demo company):
 * - every value is a string; an empty value is `""`;
 * - booleans are `"true"` / `"false"`, numbers `"222.33"`, `"0.0"`;
 * - select fields (`…K`) are `"typZasoby.zbozi"`; we keep the part after the dot;
 * - a reference is `"code:DÁV"` plus `"skupZboz@ref": "/c/demo/skupina-zbozi/18.json"`;
 * - dates are `"2016-01-01+01:00"`, timestamps `"2026-10-23T15:20:11.490+02:00"`.
 */

export type FlexiRecord = Record<string, string | undefined>;

export class MirrorMappingError extends Error {
  constructor(
    public readonly evidence: string,
    public readonly flexiId: string | undefined,
    message: string,
  ) {
    super(`${evidence} ${flexiId ?? '?'}: ${message}`);
    this.name = 'MirrorMappingError';
  }
}

// ---------------------------------------------------------------------------
// Value parsers
// ---------------------------------------------------------------------------

/**
 * `""` / blank / missing → null, otherwise the value as Flexi sent it. Not
 * trimmed: codes must match Flexi exactly (the demo has one starting with a BOM).
 */
export function str(v: string | undefined): string | null {
  return v !== undefined && v.trim() !== '' ? v : null;
}

/** Like `str`, trimmed (for numbers and dates). */
function trimmed(v: string | undefined): string | null {
  const t = v?.trim();
  return t ? t : null;
}

const DECIMAL = /^-?\d+(\.\d+)?$/;

/** Decimal as a string (no float rounding); `""` → null. */
export function dec(v: string | undefined): string | null {
  const t = trimmed(v);
  if (t === null) return null;
  if (!DECIMAL.test(t)) throw new Error(`not a number: "${t}"`);
  return t;
}

/** Like `dec`, but missing → "0" (for NOT NULL quantity columns). */
export function dec0(v: string | undefined): string {
  return dec(v) ?? '0';
}

export function int(v: string | undefined): number | null {
  const t = dec(v);
  if (t === null) return null;
  const n = Number(t);
  if (!Number.isInteger(n)) throw new Error(`not an integer: "${t}"`);
  return n;
}

export function bool(v: string | undefined): boolean {
  return v === 'true';
}

/** Timestamp with offset → Date; `""` → null. */
export function timestamp(v: string | undefined): Date | null {
  const t = trimmed(v);
  if (t === null) return null;
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) throw new Error(`not a timestamp: "${t}"`);
  return d;
}

/** Flexi date `2026-01-01+01:00` → `2026-01-01` (calendar date, no time zone). */
export function date(v: string | undefined): string | null {
  const t = trimmed(v);
  if (t === null) return null;
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(t);
  if (!m) throw new Error(`not a date: "${t}"`);
  return m[1]!;
}

/** Select value `typZasoby.zbozi` → `zbozi`; `""` → null. */
export function selectKey(v: string | undefined): string | null {
  const t = trimmed(v);
  if (t === null) return null;
  const dot = t.indexOf('.');
  return dot === -1 ? t : t.slice(dot + 1);
}

/** Internal id of a referenced record, from `<field>@ref` (`/c/demo/cenik/581.json` → 581). */
export function refId(rec: FlexiRecord, field: string): number | null {
  const ref = trimmed(rec[`${field}@ref`]);
  if (ref === null) return null;
  const m = /\/(\d+)\.json$/.exec(ref);
  if (!m) throw new Error(`unexpected ${field}@ref: "${ref}"`);
  return Number(m[1]);
}

/** Code of a referenced record (`code:CZK` → `CZK`); `""` → null. */
export function refCode(v: string | undefined): string | null {
  const t = trimmed(v);
  if (t === null) return null;
  return t.startsWith('code:') ? t.slice(5) : t;
}

/** Labels `"BAT, AHOJ, B2B"` → `["BAT", "AHOJ", "B2B"]`. */
export function labels(v: string | undefined): string[] {
  return (v ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Record without the `@showAs` / `@ref` helper keys, for the `raw` column. */
export function rawOf(rec: FlexiRecord): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(rec)) if (!k.includes('@') && v !== undefined) out[k] = v;
  return out;
}

// ---------------------------------------------------------------------------
// Rows (what the store writes)
// ---------------------------------------------------------------------------

interface Base {
  flexiId: number;
  lastUpdate: Date | null;
}

export interface CodebookRow extends Base {
  kod: string;
  nazev: string | null;
}

export interface TypAtributuRow extends CodebookRow {
  typ: string | null;
}

export interface UcetniObdobiRow extends Base {
  kod: string;
  popis: string | null;
  platiOd: string;
  platiDo: string;
}

export interface AdresarRow extends CodebookRow {
  ic: string | null;
  dic: string | null;
}

export interface CenikRow extends Base {
  flexiCreatedAt: Date | null;
  kod: string;
  nazev: string;
  popis: string | null;
  kratkyPopis: string | null;
  klicSlova: string | null;
  techParam: string | null;
  eanKod: string | null;
  typZasoby: string;
  skladove: boolean;
  exportNaEshop: boolean;
  skupinaZboziFlexiId: number | null;
  mj1FlexiId: number | null;
  stitky: string[];
  platiOdRok: number | null;
  platiDoRok: number | null;
  typCenyDph: string | null;
  typSazbyDph: string | null;
  szbDph: string | null;
  cenaZakl: string | null;
  cenaZaklBezDph: string | null;
  cenaZaklVcDph: string | null;
  cenaBezna: string | null;
  nakupCena: string | null;
  sumStavMj: string;
  sumDostupMj: string;
  sumRezerMj: string;
  zaruka: number | null;
  mjZaruky: string | null;
  dodaciLhuta: string | null;
  mjDodaciLhutyFlexiId: number | null;
  hmotnostNetto: string | null;
  mjHmotnostiFlexiId: number | null;
  evidSarze: boolean;
  evidExpirace: boolean;
  raw: Record<string, string>;
}

export interface SkladovaKartaRow extends Base {
  cenikFlexiId: number;
  skladFlexiId: number;
  ucetniObdobiFlexiId: number;
  stavMj: string;
  minMj: string;
  maxMj: string;
  rezervMj: string;
  dostupMj: string;
}

export interface CenikAtributRow extends Base {
  cenikFlexiId: number;
  typAtributuFlexiId: number;
  hodnota: string | null;
  valNumeric: string | null;
  raw: Record<string, string>;
}

export interface CenikOdberatelRow extends Base {
  cenikFlexiId: number;
  firmaFlexiId: number | null;
  mena: string | null;
  prodejCena: string | null;
  platiOd: string | null;
  platiDo: string | null;
  raw: Record<string, string>;
}

export interface CenikDodavatelRow extends Base {
  cenikFlexiId: number;
  firmaFlexiId: number | null;
  mena: string | null;
  nakupCena: string | null;
  primarni: boolean;
  raw: Record<string, string>;
}

export interface CenikPrilohaRow extends Base {
  cenikFlexiId: number;
  nazevSouboru: string | null;
  contentType: string | null;
  typ: string | null;
  dataSize: number | null;
  dataHash: string | null;
  hlavni: boolean;
  odkaz: string | null;
}

/** Row type for each evidence. */
export interface MirrorRows {
  'skupina-zbozi': CodebookRow;
  'merna-jednotka': CodebookRow;
  sklad: CodebookRow;
  'typ-atributu': TypAtributuRow;
  'ucetni-obdobi': UcetniObdobiRow;
  adresar: AdresarRow;
  cenik: CenikRow;
  'skladova-karta': SkladovaKartaRow;
  atribut: CenikAtributRow;
  odberatel: CenikOdberatelRow;
  dodavatel: CenikDodavatelRow;
  priloha: CenikPrilohaRow;
}

// ---------------------------------------------------------------------------
// Mappers
// ---------------------------------------------------------------------------

function base(rec: FlexiRecord): Base {
  const flexiId = int(rec.id);
  if (flexiId === null) throw new Error('missing id');
  return { flexiId, lastUpdate: timestamp(rec.lastUpdate) };
}

function required<T>(value: T | null, field: string): T {
  if (value === null) throw new Error(`missing ${field}`);
  return value;
}

const codebook = (r: FlexiRecord): CodebookRow => ({
  ...base(r),
  kod: required(str(r.kod), 'kod'),
  nazev: str(r.nazev),
});

const MAPPERS: { [E in keyof MirrorRows]: (r: FlexiRecord) => MirrorRows[E] } = {
  'skupina-zbozi': codebook,
  'merna-jednotka': codebook,
  sklad: codebook,
  'typ-atributu': (r) => ({ ...codebook(r), typ: selectKey(r.typAtributK) }),
  'ucetni-obdobi': (r) => ({
    ...base(r),
    kod: required(str(r.kod), 'kod'),
    popis: str(r.popis),
    platiOd: required(date(r.platiOdData), 'platiOdData'),
    platiDo: required(date(r.platiDoData), 'platiDoData'),
  }),
  adresar: (r) => ({ ...codebook(r), ic: str(r.ic), dic: str(r.dic) }),
  cenik: (r) => ({
    ...base(r),
    flexiCreatedAt: timestamp(r.createdDate),
    kod: required(str(r.kod), 'kod'),
    nazev: required(str(r.nazev), 'nazev'),
    popis: str(r.popis),
    kratkyPopis: str(r.kratkyPopis),
    klicSlova: str(r.klicSlova),
    techParam: str(r.techParam),
    eanKod: str(r.eanKod),
    typZasoby: required(selectKey(r.typZasobyK), 'typZasobyK'),
    skladove: bool(r.skladove),
    exportNaEshop: bool(r.exportNaEshop),
    skupinaZboziFlexiId: refId(r, 'skupZboz'),
    mj1FlexiId: refId(r, 'mj1'),
    stitky: labels(r.stitky),
    platiOdRok: int(r.platiOd),
    platiDoRok: int(r.platiDo),
    typCenyDph: selectKey(r.typCenyDphK),
    typSazbyDph: selectKey(r.typSzbDphK),
    szbDph: dec(r.szbDph),
    cenaZakl: dec(r.cenaZakl),
    cenaZaklBezDph: dec(r.cenaZaklBezDph),
    cenaZaklVcDph: dec(r.cenaZaklVcDph),
    cenaBezna: dec(r.cenaBezna),
    nakupCena: dec(r.nakupCena),
    sumStavMj: dec0(r.sumStavMj),
    sumDostupMj: dec0(r.sumDostupMj),
    sumRezerMj: dec0(r.sumRezerMj),
    zaruka: int(r.zaruka),
    mjZaruky: selectKey(r.mjZarukyK),
    dodaciLhuta: dec(r.dodaciLhuta),
    mjDodaciLhutyFlexiId: refId(r, 'mjDodaciLhuta'),
    hmotnostNetto: dec(r.hmotMj),
    mjHmotnostiFlexiId: refId(r, 'mjHmot'),
    evidSarze: bool(r.evidSarze),
    evidExpirace: bool(r.evidExpir),
    raw: rawOf(r),
  }),
  'skladova-karta': (r) => ({
    ...base(r),
    cenikFlexiId: required(refId(r, 'cenik'), 'cenik'),
    skladFlexiId: required(refId(r, 'sklad'), 'sklad'),
    ucetniObdobiFlexiId: required(refId(r, 'ucetObdobi'), 'ucetObdobi'),
    stavMj: dec0(r.stavMJ),
    minMj: dec0(r.minMJ),
    maxMj: dec0(r.maxMJ),
    rezervMj: dec0(r.rezervMJ),
    dostupMj: dec0(r.dostupMj),
  }),
  atribut: (r) => ({
    ...base(r),
    cenikFlexiId: required(refId(r, 'cenik'), 'cenik'),
    typAtributuFlexiId: required(refId(r, 'typAtributu'), 'typAtributu'),
    hodnota: str(r.hodnota),
    // valInteger is filled even for text attributes (an index), so only use it
    // when the attribute has no text value.
    valNumeric: dec(r.valNumeric) ?? (str(r.valString) === null ? dec(r.valInteger) : null),
    raw: rawOf(r),
  }),
  odberatel: (r) => ({
    ...base(r),
    cenikFlexiId: required(refId(r, 'cenik'), 'cenik'),
    firmaFlexiId: refId(r, 'firma'),
    mena: refCode(r.mena),
    prodejCena: dec(r.prodejCena),
    platiOd: date(r.platiOdData),
    platiDo: date(r.platiDoData),
    raw: rawOf(r),
  }),
  dodavatel: (r) => ({
    ...base(r),
    cenikFlexiId: required(refId(r, 'cenik'), 'cenik'),
    firmaFlexiId: refId(r, 'firma'),
    mena: refCode(r.mena),
    nakupCena: dec(r.nakupCena),
    primarni: bool(r.primarni),
    raw: rawOf(r),
  }),
  priloha: (r) => ({
    ...base(r),
    cenikFlexiId: required(refId(r, 'cenik'), 'cenik'),
    nazevSouboru: str(r.nazSoub),
    contentType: str(r.contentType),
    typ: selectKey(r.typK),
    dataSize: int(r.dataSize),
    dataHash: str(r.dataHash),
    hlavni: bool(r.mainAttachment),
    odkaz: str(r.link),
  }),
};

/** Maps one Flexi record; throws MirrorMappingError with the evidence and id. */
export function mapRecord<E extends keyof MirrorRows>(evidence: E, rec: FlexiRecord): MirrorRows[E] {
  try {
    return MAPPERS[evidence](rec) as MirrorRows[E];
  } catch (e) {
    throw new MirrorMappingError(evidence, rec.id, e instanceof Error ? e.message : String(e));
  }
}

/**
 * Maps a page; records that can't be mapped are returned as `errors` instead of
 * failing the whole sync (one broken product must not stop the others).
 */
export function mapRecords<E extends keyof MirrorRows>(
  evidence: E,
  recs: FlexiRecord[],
): { rows: MirrorRows[E][]; errors: MirrorMappingError[] } {
  const rows: MirrorRows[E][] = [];
  const errors: MirrorMappingError[] = [];
  for (const rec of recs) {
    try {
      rows.push(mapRecord(evidence, rec));
    } catch (e) {
      if (e instanceof MirrorMappingError) errors.push(e);
      else throw e;
    }
  }
  return { rows, errors };
}
