'use server';

import { feedFlexiCreateInput, feedFlexiUpdateInput } from '@repo/core-sync/feed-flexi';
import { revalidatePath } from 'next/cache';

import { callApi } from '../../../../lib/api';
import { getAuth } from '../../../../lib/auth/server';

/** Per-item outcome, as the API returns it (problems are translated in the table). */
export interface FeedFlexiItemResult {
  id: string;
  ok: boolean;
  problems: string[];
  messages: string[];
  flexiId?: number;
}

export type FeedFlexiActionResult =
  | { ok: true; dryRun: boolean; okCount: number; failed: number; syncFailed: boolean; items: FeedFlexiItemResult[] }
  | { ok: false; error: 'notSignedIn' | 'apiUnconfigured' | 'apiUnreachable' | 'flexiUnconfigured' | 'failed'; messages: string[] };

interface ApiResult {
  dryRun: boolean;
  ok: number;
  failed: number;
  synced: number;
  syncFailed: boolean;
  items: FeedFlexiItemResult[];
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function run(feedId: string, op: 'create' | 'update', body: unknown): Promise<FeedFlexiActionResult> {
  const { data: session } = await getAuth().getSession();
  if (!session?.user) return { ok: false, error: 'notSignedIn', messages: [] };
  if (!UUID.test(feedId)) return { ok: false, error: 'failed', messages: [] };
  const r = await callApi<ApiResult>(`/supplier-feeds/${feedId}/flexi/${op}`, { method: 'POST', body });
  if (!r.ok) {
    if (r.reason === 'unconfigured') return { ok: false, error: 'apiUnconfigured', messages: [] };
    if (r.reason === 'unreachable') return { ok: false, error: 'apiUnreachable', messages: [] };
    if (r.status === 503) return { ok: false, error: 'flexiUnconfigured', messages: [] };
    return { ok: false, error: 'failed', messages: r.errors };
  }
  if (!r.data.dryRun) {
    revalidatePath(`/integrations/feeds/${feedId}`);
    revalidatePath('/products');
  }
  return {
    ok: true,
    dryRun: r.data.dryRun,
    okCount: r.data.ok,
    failed: r.data.failed,
    syncFailed: r.data.syncFailed,
    items: r.data.items,
  };
}

/** "Zkontrolovat nanečisto" (check) and "Založit ve Flexi". */
export async function createInFlexi(feedId: string, input: unknown): Promise<FeedFlexiActionResult> {
  const parsed = feedFlexiCreateInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'failed', messages: [] };
  return run(feedId, 'create', parsed.data);
}

/** Feed changes of paired products → Flexi. */
export async function updateInFlexi(feedId: string, input: unknown): Promise<FeedFlexiActionResult> {
  const parsed = feedFlexiUpdateInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'failed', messages: [] };
  return run(feedId, 'update', parsed.data);
}
