import { allOk, isPrivateAddress, networkFailure, resolveStep, skipped } from './net';
import type { CheckDeps, CheckResult, CheckStep, FlexiCheckInfo, FlexiCheckInput } from './types';

/** "demo.flexibee.eu" + 5434 → "https://demo.flexibee.eu:5434". */
export function flexiBaseUrl(host: string, port: number): string {
  const h = host.includes(':') && !host.startsWith('[') ? `[${host}]` : host;
  return `https://${h}:${port}`;
}

/** Companies from Flexi's /c.json (one company comes as an object, more as an array). */
export function parseCompanies(json: unknown): FlexiCheckInfo['companies'] | null {
  const raw = (json as { companies?: { company?: unknown } } | null)?.companies?.company;
  if (raw === undefined) return (json as { companies?: unknown } | null)?.companies === '' ? [] : null;
  const list = Array.isArray(raw) ? raw : [raw];
  return list
    .map((c) => c as { dbNazev?: unknown; nazev?: unknown })
    .filter((c) => typeof c.dbNazev === 'string')
    .map((c) => ({ dbNazev: c.dbNazev as string, nazev: typeof c.nazev === 'string' ? c.nazev : (c.dbNazev as string) }));
}

/**
 * ABRA Flexi REST API: host resolves (LAN only with `deps.allowPrivate`), the
 * TLS port answers, and the user can list companies (GET /c.json). Read-only;
 * the password is only sent to the Flexi server. For a private address a
 * failed connection is reported as one generic "unreachable", so the check
 * can't be used to tell closed, filtered and TLS ports apart on the LAN.
 */
export async function checkFlexi(input: FlexiCheckInput, deps: CheckDeps): Promise<CheckResult<FlexiCheckInfo>> {
  const now = deps.now ?? Date.now;
  const url = flexiBaseUrl(input.host, input.port);
  const dns = await resolveStep(input.host, deps, deps.allowPrivate ?? false);
  if (dns.status === 'failed') {
    return { ok: false, steps: [dns, skipped('connect'), skipped('auth')], latencyMs: null, info: null };
  }

  const started = now();
  let res: Response;
  try {
    res = await deps.fetch(`${url}/c.json`, {
      headers: {
        Accept: 'application/json',
        Authorization: `Basic ${Buffer.from(`${input.user}:${input.password}`).toString('base64')}`,
      },
      redirect: 'manual',
      signal: AbortSignal.timeout(deps.timeoutMs ?? 15_000),
    });
  } catch (e) {
    const f = networkFailure(e);
    const lan = isPrivateAddress(String(dns.params?.address ?? ''));
    const connect: CheckStep =
      f.code === 'blocked'
        ? { key: 'connect', status: 'failed', code: 'blocked' }
        : lan
          ? { key: 'connect', status: 'failed', code: 'unreachable', params: { port: input.port, reason: '—' } }
          : { key: 'connect', status: 'failed', code: f.code, params: { port: input.port, reason: f.reason } };
    return { ok: false, steps: [dns, connect, skipped('auth')], latencyMs: null, info: null };
  }
  const latencyMs = now() - started;
  const connect: CheckStep = { key: 'connect', status: 'ok', code: 'open', params: { port: input.port } };

  let auth: CheckStep;
  let info: FlexiCheckInfo | null = null;
  if (res.status === 401) auth = { key: 'auth', status: 'failed', code: 'unauthorized' };
  else if (res.status === 403) auth = { key: 'auth', status: 'failed', code: 'forbidden' };
  else if (!res.ok) auth = { key: 'auth', status: 'failed', code: 'httpStatus', params: { status: res.status } };
  else {
    const companies = parseCompanies(await res.json().catch(() => null));
    if (!companies) auth = { key: 'auth', status: 'failed', code: 'notFlexi' };
    else {
      info = { url, companies };
      auth = companies.length
        ? { key: 'auth', status: 'ok', code: 'authorized', params: { companies: companies.length } }
        : { key: 'auth', status: 'warn', code: 'noCompanies' };
    }
  }
  await res.body?.cancel().catch(() => undefined);

  const steps = [dns, connect, auth];
  return { ok: allOk(steps), steps, latencyMs, info };
}
