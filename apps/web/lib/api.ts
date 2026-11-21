import { apiEnv, loadEnv } from '@repo/core-config';

/**
 * Calls our API (apps/api) from the web app's server side (server actions only). The web app never
 * talks to Flexi itself; edits and syncs go through the API, authenticated with
 * the shared SYNC_API_TOKEN.
 */
export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; reason: 'unconfigured' | 'unreachable' | 'rejected' | 'failed'; status?: number; errors: string[] };

export async function callApi<T>(path: string, init: { method: string; body?: unknown }): Promise<ApiResult<T>> {
  const env = loadEnv(apiEnv);
  if (!env.SYNC_API_TOKEN) return { ok: false, reason: 'unconfigured', errors: [] };
  let res: Response;
  try {
    res = await fetch(new URL(path, env.API_URL), {
      method: init.method,
      headers: {
        Authorization: `Bearer ${env.SYNC_API_TOKEN}`,
        Accept: 'application/json',
        ...(init.body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      cache: 'no-store',
      signal: AbortSignal.timeout(60_000),
    });
  } catch (e) {
    console.error('api: request failed', path, e instanceof Error ? e.message : e);
    return { ok: false, reason: 'unreachable', errors: [] };
  }
  const json = (await res.json().catch(() => ({}))) as { errors?: unknown; message?: unknown };
  if (res.ok) return { ok: true, data: json as T };
  const errors = Array.isArray(json.errors) ? json.errors.map(String) : [];
  return {
    ok: false,
    reason: res.status === 400 || res.status === 422 || res.status === 404 ? 'rejected' : 'failed',
    status: res.status,
    errors,
  };
}
