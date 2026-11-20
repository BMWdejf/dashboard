/**
 * Povolené hodnoty textových „enumů“ v tabulkách `flexi_*` (viz `prisma/schema.prisma`).
 * Ukládá se jen část za tečkou z Flexi pole `…K` (`typZasoby.zbozi` → `zbozi`).
 * V DB jsou to obyčejné `text` sloupce, takže nová hodnota z Flexi nepotřebuje migraci.
 */

/** flexi: typZasobyK (typZasoby.*) */
export const TYP_ZASOBY = [
  'zbozi',
  'material',
  'nedvyroba',
  'polotovar',
  'vyrobek',
  'zvire',
  'sluzba',
  'poplatek',
] as const;
export type TypZasoby = (typeof TYP_ZASOBY)[number];

/** flexi: typCenyDphK (typCeny.*) */
export const TYP_CENY_DPH = ['bezDph', 'sDph'] as const;
export type TypCenyDph = (typeof TYP_CENY_DPH)[number];

/** flexi: typSzbDphK (typSzbDph.*) */
export const TYP_SAZBY_DPH = ['dphZakl', 'dphSniz', 'dphSniz2', 'dphOsv'] as const;
export type TypSazbyDph = (typeof TYP_SAZBY_DPH)[number];

/** flexi: mjZarukyK (mjZaruky.*) */
export const MJ_ZARUKY = ['rok', 'mesic', 'den'] as const;
export type MjZaruky = (typeof MJ_ZARUKY)[number];

/** flexi: typAtributK (typAtribut.*) */
export const TYP_ATRIBUTU = ['integer', 'numeric', 'retezec', 'datumCas', 'boolean'] as const;
export type TypAtributu = (typeof TYP_ATRIBUTU)[number];

/** flexi: typK v evidenci priloha (typPrilohy.*) */
export const TYP_PRILOHY = ['logo', 'podRaz', 'obrazek', 'odkaz', 'ostatni'] as const;
export type TypPrilohy = (typeof TYP_PRILOHY)[number];
