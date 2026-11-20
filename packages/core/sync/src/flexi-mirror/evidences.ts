/**
 * Which Flexi evidences the mirror reads, with which fields and filters.
 * Field names are checked against /c/demo/<evidence>/properties.json (11/2026);
 * the same requests are in the Postman collection "Dashboard Flexibee API".
 */

/** Evidences in the order the sync reads them (parents before children). */
export const MIRROR_EVIDENCES = [
  'skupina-zbozi',
  'merna-jednotka',
  'sklad',
  'typ-atributu',
  'ucetni-obdobi',
  'adresar',
  'cenik',
  'skladova-karta',
  'atribut',
  'odberatel',
  'dodavatel',
  'priloha',
] as const;
export type MirrorEvidence = (typeof MIRROR_EVIDENCES)[number];

const custom = (fields: string[]) => `custom:${fields.join(',')}` as const;

/** `detail=` for each evidence. */
export const DETAIL: Record<MirrorEvidence, `custom:${string}`> = {
  'skupina-zbozi': custom(['id', 'lastUpdate', 'kod', 'nazev']),
  'merna-jednotka': custom(['id', 'lastUpdate', 'kod', 'nazev']),
  sklad: custom(['id', 'lastUpdate', 'kod', 'nazev']),
  'typ-atributu': custom(['id', 'lastUpdate', 'kod', 'nazev', 'typAtributK']),
  'ucetni-obdobi': custom(['id', 'lastUpdate', 'kod', 'popis', 'platiOdData', 'platiDoData']),
  adresar: custom(['id', 'lastUpdate', 'kod', 'nazev', 'ic', 'dic']),
  cenik: custom([
    'id',
    'lastUpdate',
    'createdDate',
    'kod',
    'nazev',
    'popis',
    'kratkyPopis',
    'klicSlova',
    'techParam',
    'eanKod',
    'typZasobyK',
    'skladove',
    'exportNaEshop',
    'skupZboz',
    'mj1',
    'stitky',
    'platiOd',
    'platiDo',
    'typCenyDphK',
    'typSzbDphK',
    'szbDph',
    'cenaZakl',
    'cenaZaklBezDph',
    'cenaZaklVcDph',
    'cenaBezna',
    'nakupCena',
    'sumStavMj',
    'sumDostupMj',
    'sumRezerMj',
    'zaruka',
    'mjZarukyK',
    'dodaciLhuta',
    'mjDodaciLhuta',
    'hmotMj',
    'mjHmot',
    'evidSarze',
    'evidExpir',
  ]),
  'skladova-karta': custom([
    'id',
    'lastUpdate',
    'cenik',
    'sklad',
    'ucetObdobi',
    'stavMJ',
    'minMJ',
    'maxMJ',
    'rezervMJ',
    'dostupMj',
  ]),
  atribut: custom([
    'id',
    'lastUpdate',
    'cenik',
    'typAtributu',
    'hodnota',
    'valNumeric',
    'valInteger',
    'valString',
    'valBoolean',
    'valDatCas',
  ]),
  odberatel: custom([
    'id',
    'lastUpdate',
    'cenik',
    'firma',
    'mena',
    'prodejCena',
    'platiOdData',
    'platiDoData',
    'skupCen',
    'kodIndi',
  ]),
  dodavatel: custom(['id', 'lastUpdate', 'cenik', 'firma', 'mena', 'nakupCena', 'primarni', 'kodIndi']),
  priloha: custom([
    'id',
    'lastUpdate',
    'cenik',
    'nazSoub',
    'contentType',
    'typK',
    'dataSize',
    'dataHash',
    'mainAttachment',
    'link',
  ]),
};

/** Small evidences: read whole every run (no cursor). */
export const FULL_EVIDENCES: ReadonlySet<MirrorEvidence> = new Set([
  'skupina-zbozi',
  'merna-jednotka',
  'sklad',
  'typ-atributu',
  'ucetni-obdobi',
]);

/** Extra filter (besides `lastUpdate gt …`) per evidence. */
export const BASE_FILTER: Partial<Record<MirrorEvidence, string>> = {
  // Attributes and attachments exist for many evidences; we want the price list's.
  atribut: 'cenik is not empty',
  priloha: 'cenik is not empty',
};
