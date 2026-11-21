'use server';

import type { CheckResult, FeedCheckInfo, FlexiCheckInfo, ShoptetCheckInfo } from '@repo/core-sync';

import { callApi } from '../../../lib/api';
import { getAuth } from '../../../lib/auth/server';
import { getI18n } from '../../../lib/locale';

export type ConnectionKind = 'flexi' | 'shoptet' | 'feed';

export type AnyCheckResult = CheckResult<FlexiCheckInfo | ShoptetCheckInfo | FeedCheckInfo>;

export type CheckActionResult =
  | { ok: true; result: AnyCheckResult }
  | { ok: false; message: string; details: string[] };

/**
 * "Otestovat připojení": sends the form to our API's pre-flight check
 * (POST /integrations/checks/:kind). The values pass through and are not
 * stored or logged here.
 */
export async function runCheck(kind: ConnectionKind, input: Record<string, string>): Promise<CheckActionResult> {
  const { t } = await getI18n();
  const te = t.integrationsNew.errors;
  const { data: session } = await getAuth().getSession();
  if (!session?.user) return { ok: false, message: te.notSignedIn, details: [] };
  if (kind !== 'flexi' && kind !== 'shoptet' && kind !== 'feed') return { ok: false, message: te.failed, details: [] };

  const r = await callApi<AnyCheckResult>(`/integrations/checks/${kind}`, { method: 'POST', body: input });
  if (r.ok) return { ok: true, result: r.data };
  if (r.reason === 'unconfigured') return { ok: false, message: te.unconfigured, details: [] };
  if (r.reason === 'unreachable') return { ok: false, message: te.unreachable, details: [] };
  if (r.reason === 'rejected') return { ok: false, message: te.rejected, details: r.errors };
  return { ok: false, message: te.failed, details: [] };
}
