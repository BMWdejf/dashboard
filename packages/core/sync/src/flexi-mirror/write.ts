import { z } from 'zod';

import { mapRecords, type FlexiRecord, type UcetniObdobiRow } from './map';
import { DETAIL, type MirrorEvidence } from './evidences';
import {
  currentPeriod,
  pragueDate,
  safeError,
  type MirrorFlexiReader,
  type MirrorStore,
  type SyncCounts,
  type SyncTrigger,
} from './run';

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
export function buildCenikUpdate(
  flexiId: number,
  changes: ProductChanges,
): Record<string, string> {
  const r: Record<string, string> = { id: String(flexiId) };
  if (changes.nazev !== undefined) r.nazev = changes.nazev;
  if (changes.nakupCena !== undefined) r.nakupCena = changes.nakupCena;
  if (changes.cenaZakl !== undefined) r.cenaZakl = changes.cenaZakl;
  if (changes.typSazbyDph !== undefined)
    r.typSzbDphK = `typSzbDph.${changes.typSazbyDph}`;
  if (changes.skupinaKod !== undefined)
    r.skupZboz =
      changes.skupinaKod === null ? '' : `code:${changes.skupinaKod}`;
  if (changes.exportNaEshop !== undefined)
    r.exportNaEshop = String(changes.exportNaEshop);
  return r;
}

/** Per-product child evidences, read again with the product. */
const CHILDREN = ['atribut', 'odberatel', 'dodavatel', 'priloha'] as const;

/**
 * Reads one product, its attributes, prices, attachments and its stock cards
 * of the current period from Flexi into the mirror, then recomputes stock
 * totals. Recorded as a sync run, so the product page shows when it ran. For
 * "Synchronizovat teď" and after a real write.
 */
export async function syncOneProduct(opts: {
  flexi: MirrorFlexiReader;
  store: MirrorStore;
  flexiId: number;
  trigger?: SyncTrigger;
  now?: () => Date;
}): Promise<{ found: boolean; cards: number; runId: string }> {
  const { flexi, store, flexiId } = opts;
  const now = opts.now ?? (() => new Date());
  const counts: SyncCounts = { evidences: {}, errors: [], product: flexiId };
  const runId = await store.startRun(opts.trigger ?? 'api');

  /** Reads `evidence` with `filter`, writes what maps and counts it. */
  async function read<E extends MirrorEvidence>(evidence: E, filter: string) {
    const { rows } = await flexi.list<FlexiRecord>(evidence, {
      filter,
      detail: DETAIL[evidence],
      limit: 0,
    });
    const mapped = mapRecords(evidence, rows);
    const w = mapped.rows.length
      ? await store.upsert(evidence, mapped.rows)
      : { written: 0, skipped: 0 };
    counts.evidences[evidence] = {
      fetched: rows.length,
      written: w.written,
      skipped: w.skipped,
      invalid: mapped.errors.length,
      deleted: 0,
    };
    counts.errors.push(...mapped.errors.slice(0, 5).map((e) => e.message));
    return mapped;
  }

  try {
    const product = await read('cenik', `id = ${flexiId}`);
    if (product.errors.length) throw product.errors[0]!;
    if (!product.rows.length) {
      await store.finishRun(runId, {
        status: 'failed',
        counts,
        error: `Flexi has no product ${flexiId}.`,
      });
      return { found: false, cards: 0, runId };
    }
    for (const evidence of CHILDREN) await read(evidence, `cenik = ${flexiId}`);

    const periods = mapRecords(
      'ucetni-obdobi',
      (
        await flexi.list<FlexiRecord>('ucetni-obdobi', {
          detail: DETAIL['ucetni-obdobi'],
          limit: 0,
        })
      ).rows,
    ).rows as UcetniObdobiRow[];
    const period = currentPeriod(periods, pragueDate(now()));
    let cards = 0;
    if (period) {
      counts.period = period.kod;
      cards = (
        await read(
          'skladova-karta',
          `cenik = ${flexiId} and ucetObdobi = 'code:${period.kod}'`,
        )
      ).rows.length;
      counts.stockHistoryRows = await store.refreshStock(period.flexiId, now());
    } else {
      counts.errors.push(
        `No accounting period covers ${pragueDate(now())}; stock cards skipped.`,
      );
    }
    await store.finishRun(runId, { status: 'success', counts });
    return { found: true, cards, runId };
  } catch (e) {
    await store
      .finishRun(runId, { status: 'failed', counts, error: safeError(e) })
      .catch(() => {});
    throw e;
  }
}

/**
 * Reads several products and their attachments from Flexi into the mirror
 * (stock cards come with the next sync). For products created or updated from
 * a supplier feed. Returns how many products were found.
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
    // Their attachments too, so the feed page sees the image links written with them.
    const prilohy = await opts.flexi.list<FlexiRecord>('priloha', {
      filter: `cenik in (${chunk.join(',')})`,
      detail: DETAIL.priloha,
      limit: 0,
    });
    const mappedPrilohy = mapRecords('priloha', prilohy.rows);
    if (mappedPrilohy.errors.length) throw mappedPrilohy.errors[0]!;
    if (mappedPrilohy.rows.length) await opts.store.upsert('priloha', mappedPrilohy.rows);
  }
  return found;
}
