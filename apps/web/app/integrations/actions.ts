'use server';

import { revalidatePath } from 'next/cache';

import { callApi } from '../../lib/api';
import { getAuth } from '../../lib/auth/server';
import { getI18n } from '../../lib/locale';

export type SyncAllResult = { ok: boolean; message: string };

/**
 * "Synchronizovat vše": starts the Flexi → Neon mirror sync through our API
 * (POST /sync/flexi, 202 + runId). It only reads Flexi; Shoptet and the XML feed
 * have no sync yet.
 */
export async function syncAll(): Promise<SyncAllResult> {
  const { t } = await getI18n();
  const ti = t.integrations;
  const { data: session } = await getAuth().getSession();
  if (!session?.user) return { ok: false, message: ti.notSignedIn };

  const r = await callApi<{ runId: string }>('/sync/flexi', { method: 'POST' });
  if (!r.ok) {
    if (r.status === 409) return { ok: false, message: ti.syncRunning };
    if (r.reason === 'unconfigured') return { ok: false, message: ti.syncUnconfigured };
    if (r.reason === 'unreachable') return { ok: false, message: ti.syncUnreachable };
    return { ok: false, message: ti.syncFailed };
  }
  revalidatePath('/integrations');
  return { ok: true, message: ti.syncStarted };
}
