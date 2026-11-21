'use server';

import { getProductDetail, saveShoptetSettings, shoptetSettingsInput } from '@repo/core-db';
import { productChangesSchema } from '@repo/core-sync';
import { revalidatePath } from 'next/cache';

import { callApi } from '../../../lib/api';
import { getAuth } from '../../../lib/auth/server';
import { getI18n } from '../../../lib/locale';

/** One message per line for the status bar; tone decides its colour. */
export type ActionResult = { ok: boolean; tone: 'ok' | 'warn' | 'error'; messages: string[] };

type T = Awaited<ReturnType<typeof getI18n>>['t']['products']['detail']['edit'];

/** Session + product lookup; the Flexi id comes from the mirror, never from the browser. */
async function context(cenikId: string) {
  const { t } = await getI18n();
  const te = t.products.detail.edit;
  const { data: session } = await getAuth().getSession();
  if (!session?.user) return { ok: false as const, te, error: te.notSignedIn };
  const product = await getProductDetail(cenikId).catch(() => null);
  if (!product) return { ok: false as const, te, error: te.failed };
  return { ok: true as const, te, userId: session.user.id, flexiId: product.flexiId };
}

function apiError(te: T, r: { reason: string; errors: string[] }): string[] {
  if (r.reason === 'unconfigured') return [te.apiUnconfigured];
  if (r.reason === 'unreachable') return [te.apiUnreachable];
  if (r.reason === 'rejected' && r.errors.length) return [te.flexiRejected, ...r.errors];
  return [te.failed];
}

/**
 * "Uložit a odeslat": Flexi changes go to our API (Flexi write, dry-run unless
 * FLEXI_DRY_RUN=false); Shoptet values are saved in the dashboard database.
 */
export async function saveProduct(input: { cenikId: string; flexi?: unknown; shoptet?: unknown }): Promise<ActionResult> {
  const ctx = await context(input.cenikId);
  if (!ctx.ok) return { ok: false, tone: 'error', messages: [ctx.error] };
  const { te } = ctx;
  if (input.flexi === undefined && input.shoptet === undefined) {
    return { ok: false, tone: 'warn', messages: [te.noChanges] };
  }

  const flexi = input.flexi === undefined ? null : productChangesSchema.safeParse(input.flexi);
  const shoptet = input.shoptet === undefined ? null : shoptetSettingsInput.safeParse(input.shoptet);
  const issues = [
    ...(flexi && !flexi.success ? flexi.error.issues : []),
    ...(shoptet && !shoptet.success ? shoptet.error.issues : []),
  ];
  if (issues.length) {
    // Field names the user sees, not zod's paths and English messages.
    const { t } = await getI18n();
    const td = t.products.detail;
    const names: Record<string, string> = {
      nazev: td.rowTitle,
      title: `${td.colShoptet}: ${td.rowTitle}`,
      nakupCena: td.rowPurchase,
      cenaZakl: td.rowPriceNet,
      priceGross: `${td.colShoptet}: ${td.rowPriceGross}`,
      typSazbyDph: td.rowVat,
      skupinaKod: td.rowCategory,
      category: `${td.colShoptet}: ${td.rowCategory}`,
      stock: `${td.colShoptet}: ${td.rowStock}`,
      safetyBuffer: te.buffer,
    };
    const fields = [...new Set(issues.map((i) => String(i.path[i.path.length - 1] ?? '')))];
    return {
      ok: false,
      tone: 'error',
      messages: [te.invalid, ...fields.map((f) => `${names[f] ?? f}: ${t.common.invalidValue}`)],
    };
  }

  const messages: string[] = [];
  let tone: ActionResult['tone'] = 'ok';

  if (flexi?.success) {
    const r = await callApi<{ dryRun: boolean; synced: boolean }>(`/products/${ctx.flexiId}`, {
      method: 'PATCH',
      body: flexi.data,
    });
    if (!r.ok) return { ok: false, tone: 'error', messages: apiError(te, r) };
    if (r.data.dryRun) {
      messages.push(te.savedFlexiDryRun);
      tone = 'warn';
    } else {
      messages.push(te.savedFlexi);
    }
  }

  if (shoptet?.success) {
    try {
      await saveShoptetSettings(input.cenikId, shoptet.data, ctx.userId);
      messages.push(te.savedShoptet);
    } catch (e) {
      console.error('saveProduct: shoptet settings failed', e instanceof Error ? e.message : e);
      return { ok: false, tone: 'error', messages: [...messages, te.failed] };
    }
  }

  revalidatePath(`/products/${input.cenikId}`);
  return { ok: true, tone, messages };
}

/** "Synchronizovat teď": read this product from Flexi into the mirror via the API. */
export async function syncProduct(cenikId: string): Promise<ActionResult> {
  const ctx = await context(cenikId);
  if (!ctx.ok) return { ok: false, tone: 'error', messages: [ctx.error] };
  const r = await callApi<{ cards: number }>(`/products/${ctx.flexiId}/sync`, { method: 'POST' });
  if (!r.ok) return { ok: false, tone: 'error', messages: apiError(ctx.te, r) };
  revalidatePath(`/products/${cenikId}`);
  revalidatePath('/products');
  return { ok: true, tone: 'ok', messages: [ctx.te.syncedNow] };
}
