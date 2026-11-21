import { allOk, networkFailure, skipped } from './net';
import type { CheckDeps, CheckResult, CheckStep, ShoptetCheckInfo, ShoptetCheckInput } from './types';

/** E-shop name and address from GET /api/eshop. */
export function parseEshop(json: unknown): ShoptetCheckInfo | null {
  const data = (json as { data?: Record<string, unknown> } | null)?.data;
  if (!data || typeof data !== 'object') return null;
  const contact = (data.contactInformation ?? {}) as { eshopName?: unknown; url?: unknown };
  const str = (v: unknown) => (typeof v === 'string' && v ? v : null);
  return { name: str(contact.eshopName) ?? str(data.name), url: str(contact.url) ?? str(data.url) };
}

/**
 * Shoptet private API token: our API reaches Shoptet (SHOPTET_API_URL, not
 * user input) and the token reads the e-shop info.
 */
export async function checkShoptet(
  input: ShoptetCheckInput,
  deps: CheckDeps & { baseUrl: string },
): Promise<CheckResult<ShoptetCheckInfo>> {
  const now = deps.now ?? Date.now;
  const started = now();
  let res: Response;
  try {
    res = await deps.fetch(`${deps.baseUrl.replace(/\/$/, '')}/api/eshop`, {
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/vnd.shoptet.v1.0',
        'Shoptet-Private-API-Token': input.token,
      },
      signal: AbortSignal.timeout(deps.timeoutMs ?? 15_000),
    });
  } catch (e) {
    const f = networkFailure(e);
    return {
      ok: false,
      steps: [{ key: 'connect', status: 'failed', code: f.code, params: { reason: f.reason } }, skipped('auth'), skipped('eshop')],
      latencyMs: null,
      info: null,
    };
  }
  const latencyMs = now() - started;
  const connect: CheckStep = { key: 'connect', status: 'ok', code: 'reachable' };
  const json = await res.json().catch(() => null);

  if (res.status === 401 || res.status === 403) {
    return { ok: false, steps: [connect, { key: 'auth', status: 'failed', code: 'invalidToken' }, skipped('eshop')], latencyMs, info: null };
  }
  if (!res.ok) {
    return {
      ok: false,
      steps: [connect, { key: 'auth', status: 'failed', code: 'httpStatus', params: { status: res.status } }, skipped('eshop')],
      latencyMs,
      info: null,
    };
  }
  const info = parseEshop(json);
  const auth: CheckStep = { key: 'auth', status: 'ok', code: 'valid' };
  const eshop: CheckStep = info
    ? { key: 'eshop', status: 'ok', code: 'found', params: { name: info.name ?? info.url ?? '—' } }
    : { key: 'eshop', status: 'warn', code: 'unknownShape' };
  const steps = [connect, auth, eshop];
  return { ok: allOk(steps), steps, latencyMs, info };
}
