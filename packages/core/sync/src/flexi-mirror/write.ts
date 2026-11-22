import { z } from 'zod';

import { DETAIL } from './evidences';
import { mapRecords, type FlexiRecord, type UcetniObdobiRow } from './map';
import { currentPeriod, pragueDate, type MirrorFlexiReader, type MirrorStore } from './run';

/**
 * Editing a product from the dashboard (product detail → "Uložit a odeslat"):
 * validated changes → a Flexi `cenik` record, written by the API with
 * FlexiClient.upsert (dry-run unless FLEXI_DRY_RUN=false), then the product is
 * read back into the mirror. Stock is not editable: Flexi changes it only
 * through stock movements.
 */

export const VAT_RATES = ['dphZakl', 'dphSniz', 'dphSniz2', 'dphOsv'] as const;

const decimal = z
  .string()
  .trim()
  .transform((s) => s.replace(',', '.'))
  .refine((s) => /^\d+(\.\d+)?$/.test(s), 'expected a non-negative number');

export const productChangesSchema = z
  .object({
    nazev: z.string().trim().min(1).max(255),
    nakupCena: decimal,
    /** Base price in the product's own price type (typCenyDph: without or with VAT). */
    cenaZakl: decimal,
    typSazbyDph: z.enum(VAT_RATES),
    /** Group code; null clears the group. */
    skupinaKod: z.string().trim().min(1).max(64).nullable(),
    exportNaEshop: z.boolean(),
  })
  .partial()
  .strict()
  .refine((c) => Object.keys(c).length > 0, 'no changes');
export type ProductChanges = z.infer<typeof productChangesSchema>;

/** Changes → the record for PUT /c/{firma}/cenik.json (identified by Flexi id). */
export function buildCenikUpdate(flexiId: number, changes: ProductChanges): Record<string, string> {
  const r: Record<string, string> = { id: String(flexiId) };
  if (changes.nazev !== undefined) r.nazev = changes.nazev;
  if (changes.nakupCena !== undefined) r.nakupCena = changes.nakupCena;
  if (changes.cenaZakl !== undefined) r.cenaZakl = changes.cenaZakl;
  if (changes.typSazbyDph !== undefined) r.typSzbDphK = `typSzbDph.${changes.typSazbyDph}`;
  if (changes.skupinaKod !== undefined) r.skupZboz = changes.skupinaKod === null ? '' : `code:${changes.skupinaKod}`;
  if (changes.exportNaEshop !== undefined) r.exportNaEshop = String(changes.exportNaEshop);
  return r;
}

/**
 * Reads one product (and its stock cards of the current period) from Flexi
 * into the mirror, then recomputes stock totals. For "Synchronizovat teď" and
 * after a real write.
 */
export async function syncOneProduct(opts: {
  flexi: MirrorFlexiReader;
  store: MirrorStore;
  flexiId: number;
  now?: () => Date;
}): Promise<{ found: boolean; cards: number }> {
  const { flexi, store, flexiId } = opts;
  const now = opts.now ?? (() => new Date());

  const { rows } = await flexi.list<FlexiRecord>('cenik', { filter: `id = ${flexiId}`, detail: DETAIL.cenik });
  const mapped = mapRecords('cenik', rows);
  if (mapped.errors.length) throw mapped.errors[0]!;
  if (!mapped.rows.length) return { found: false, cards: 0 };
  await store.upsert('cenik', mapped.rows);

  const periods = mapRecords(
    'ucetni-obdobi',
    (await flexi.list<FlexiRecord>('ucetni-obdobi', { detail: DETAIL['ucetni-obdobi'], limit: 0 })).rows,
  ).rows as UcetniObdobiRow[];
  const period = currentPeriod(periods, pragueDate(now()));
  if (!period) return { found: true, cards: 0 };

  const cards = await flexi.list<FlexiRecord>('skladova-karta', {
    filter: `cenik = ${flexiId} and ucetObdobi = 'code:${period.kod}'`,
    detail: DETAIL['skladova-karta'],
    limit: 0,
  });
  const mappedCards = mapRecords('skladova-karta', cards.rows);
  if (mappedCards.rows.length) await store.upsert('skladova-karta', mappedCards.rows);
  await store.refreshStock(period.flexiId, now());
  return { found: true, cards: mappedCards.rows.length };
}

/**
 * Reads several products from Flexi into the mirror (no stock cards: new
 * products have none, and their stock comes with the next full sync). For
 * products created or updated from a supplier feed. Returns how many were found.
 */
export async function syncProductsByIds(opts: {
  flexi: MirrorFlexiReader;
  store: MirrorStore;
  flexiIds: number[];
}): Promise<number> {
  const ids = [...new Set(opts.flexiIds)].filter((id) => Number.isInteger(id) && id > 0);
  let found = 0;
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    const { rows } = await opts.flexi.list<FlexiRecord>('cenik', {
      filter: `id in (${chunk.join(',')})`,
      detail: DETAIL.cenik,
      limit: 0,
    });
    const mapped = mapRecords('cenik', rows);
    if (mapped.errors.length) throw mapped.errors[0]!;
    if (mapped.rows.length) await opts.store.upsert('cenik', mapped.rows);
    found += mapped.rows.length;
  }
  return found;
}
