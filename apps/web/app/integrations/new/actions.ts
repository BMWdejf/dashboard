'use server';

import type {
  CheckResult,
  FeedCheckInfo,
  FeedFailure,
  FeedPreview,
  FlexiCheckInfo,
  ShoptetCheckInfo,
  SupplierFeedInput,
} from '@repo/core-sync';
import { revalidatePath } from 'next/cache';

import { callApi } from '../../../lib/api';
import { getAuth } from '../../../lib/auth/server';
import { fill } from '../../../lib/i18n';
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

export type FeedPreviewActionResult =
  | { ok: true; preview: FeedPreview }
  | { ok: false; message: string };

/**
 * Mapping step: every tag of the feed with a sample value and a suggested
 * mapping (POST /supplier-feeds/preview). Read-only.
 */
export async function previewFeed(url: string, itemElement: string): Promise<FeedPreviewActionResult> {
  const { t } = await getI18n();
  const te = t.integrationsNew.errors;
  const { data: session } = await getAuth().getSession();
  if (!session?.user) return { ok: false, message: te.notSignedIn };

  const r = await callApi<{ ok: true; preview: FeedPreview } | { ok: false; failure: FeedFailure }>(
    '/supplier-feeds/preview',
    { method: 'POST', body: { url, itemElement } },
  );
  if (!r.ok) return { ok: false, message: apiMessage(r.reason, te) };
  if (!r.data.ok) return { ok: false, message: failureText(r.data.failure, t.integrationsNew.codes) };
  return { ok: true, preview: r.data.preview };
}

export type ConnectFeedResult = { ok: true; id: string } | { ok: false; message: string };

/** "Připojit feed": saves the feed with its mapping and schedule; the API imports it right away. */
export async function connectFeed(input: SupplierFeedInput): Promise<ConnectFeedResult> {
  const { t } = await getI18n();
  const te = t.integrationsNew.errors;
  const tw = t.integrationsNew.wizard.errors;
  const { data: session } = await getAuth().getSession();
  if (!session?.user) return { ok: false, message: te.notSignedIn };

  const r = await callApi<{ id: string }>('/supplier-feeds', {
    method: 'POST',
    body: { ...input, createdBy: session.user.id },
  });
  if (!r.ok) {
    if (r.status === 409) return { ok: false, message: tw.exists };
    if (r.reason === 'rejected') return { ok: false, message: tw.invalid };
    if (r.reason === 'failed') return { ok: false, message: tw.failed };
    return { ok: false, message: apiMessage(r.reason, te) };
  }
  revalidatePath('/integrations');
  return { ok: true, id: r.data.id };
}

function apiMessage(reason: string, te: { unconfigured: string; unreachable: string; rejected: string; failed: string }) {
  if (reason === 'unconfigured') return te.unconfigured;
  if (reason === 'unreachable') return te.unreachable;
  if (reason === 'rejected') return te.rejected;
  return te.failed;
}

/** A feed failure (check step code + params) in the user's language. */
function failureText(f: FeedFailure, codes: Record<string, string>): string {
  return fill(codes[f.code] ?? codes.internal ?? f.code, { reason: '', ...(f.params ?? {}) });
}
