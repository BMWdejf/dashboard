import { z } from 'zod';

import { idPath, type FlexiId } from './ids';

export interface FlexiClientOptions {
  /** Server URL with port, e.g. https://demo.flexibee.eu:5434 */
  url: string;
  /** Company identifier (the `{firma}` in /c/{firma}/...). */
  company: string;
  user: string;
  password: string;
  /**
   * When true (the default), every write is sent with ?dry-run=true: Flexi
   * validates it and saves nothing. Turn it off only for a real sync.
   */
  dryRun?: boolean;
  fetch?: typeof fetch;
  /**
   * Sent as User-Agent. Some Flexi servers (the public demo among them) block
   * Node's default `node` agent with "Request blocked".
   */
  userAgent?: string;
}

export const DEFAULT_FLEXI_USER_AGENT = 'dashboard-flexi-client/0.1';

export interface ListOptions {
  /** Flexi filter expression, e.g. `kod='TRIKO-M'` or `lastUpdate gt '2026-01-01'`. */
  filter?: string;
  limit?: number;
  start?: number;
  detail?: 'id' | 'summary' | 'full' | `custom:${string}`;
  query?: Record<string, string | number | boolean>;
}

const writeResult = z.looseObject({
  id: z.string().optional(),
  ref: z.string().optional(),
  errors: z.array(z.looseObject({ message: z.string() })).optional(),
});

const writeResponse = z.object({
  winstrom: z.looseObject({
    success: z.string(),
    results: z.array(writeResult).optional(),
    message: z.string().optional(),
  }),
});

export type FlexiWriteResult = z.infer<typeof writeResult>;

/** One entry of the Changes API. */
export interface FlexiChange {
  '@evidence': string;
  '@in-version': string;
  '@operation': 'create' | 'update' | 'delete';
  '@timestamp'?: string;
  id: string;
  'external-ids'?: string[];
}

export class FlexiApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly messages: string[],
  ) {
    super(`ABRA Flexi ${status}: ${messages.join('; ') || 'request failed'}`);
    this.name = 'FlexiApiError';
  }
}

export class FlexiClient {
  private readonly base: string;
  private readonly auth: string;
  private readonly dryRun: boolean;
  private readonly fetchImpl: typeof fetch;
  private readonly userAgent: string;

  constructor(opts: FlexiClientOptions) {
    this.base = `${opts.url.replace(/\/$/, '')}/c/${encodeURIComponent(opts.company)}`;
    this.auth = 'Basic ' + Buffer.from(`${opts.user}:${opts.password}`).toString('base64');
    this.dryRun = opts.dryRun ?? true;
    this.fetchImpl = opts.fetch ?? fetch;
    this.userAgent = opts.userAgent ?? DEFAULT_FLEXI_USER_AGENT;
  }

  get isDryRun(): boolean {
    return this.dryRun;
  }

  /** List records of an evidence (e.g. `objednavka-prijata`, `adresar`, `cenik`). */
  async list<T = Record<string, unknown>>(
    evidence: string,
    opts: ListOptions = {},
  ): Promise<{ rows: T[]; rowCount?: number }> {
    const filter = opts.filter ? `/(${encodeURIComponent(opts.filter)})` : '';
    const url = new URL(`${this.base}/${evidence}${filter}.json`);
    url.searchParams.set('add-row-count', 'true');
    if (opts.limit !== undefined) url.searchParams.set('limit', String(opts.limit));
    if (opts.start !== undefined) url.searchParams.set('start', String(opts.start));
    if (opts.detail) url.searchParams.set('detail', opts.detail);
    for (const [k, v] of Object.entries(opts.query ?? {})) url.searchParams.set(k, String(v));

    const body = await this.send('GET', url);
    const winstrom = (body as { winstrom?: Record<string, unknown> }).winstrom ?? {};
    const rows = (winstrom[evidence] as T[] | undefined) ?? [];
    const rowCount = winstrom['@rowCount'] !== undefined ? Number(winstrom['@rowCount']) : undefined;
    return { rows, rowCount };
  }

  /**
   * Changes API (`/changes.json`): every create/update/delete since `start`, in
   * version order. Needs the changelog enabled in the company (`changes/status`).
   * `next` is the version to pass as `start` next time (undefined = no more).
   */
  async changes(
    opts: { start?: number; limit?: number; evidence?: string } = {},
  ): Promise<{ changes: FlexiChange[]; globalVersion?: number; next?: number }> {
    const url = new URL(`${this.base}/changes.json`);
    if (opts.start !== undefined) url.searchParams.set('start', String(opts.start));
    if (opts.limit !== undefined) url.searchParams.set('limit', String(opts.limit));
    if (opts.evidence) url.searchParams.set('evidence', opts.evidence);
    const body = (await this.send('GET', url)) as { winstrom?: Record<string, unknown> };
    const w = body.winstrom ?? {};
    const toNum = (v: unknown) =>
      v === undefined || v === 'none' || v === '' ? undefined : Number(v);
    return {
      changes: (w.changes as FlexiChange[] | undefined) ?? [],
      globalVersion: toNum(w['@globalVersion']),
      next: toNum(w.next),
    };
  }

  /** One record by any identifier; undefined when it doesn't exist. */
  async get<T = Record<string, unknown>>(
    evidence: string,
    id: FlexiId | FlexiId[],
    detail: ListOptions['detail'] = 'full',
  ): Promise<T | undefined> {
    const url = new URL(`${this.base}/${evidence}/${idPath(id)}.json`);
    url.searchParams.set('detail', detail);
    try {
      const body = (await this.send('GET', url)) as { winstrom?: Record<string, unknown> };
      return (body.winstrom?.[evidence] as T[] | undefined)?.[0];
    } catch (e) {
      if (e instanceof FlexiApiError && e.status === 404) return undefined;
      throw e;
    }
  }

  /**
   * Create or update records. A record whose `id` is an existing identifier
   * (e.g. an `ext:` id) is updated, otherwise created, so repeating a sync is
   * safe.
   */
  async upsert(evidence: string, records: Record<string, unknown>[]): Promise<FlexiWriteResult[]> {
    const url = new URL(`${this.base}/${evidence}.json`);
    if (this.dryRun) url.searchParams.set('dry-run', 'true');
    const body = await this.send('PUT', url, { winstrom: { [evidence]: records } });
    const parsed = writeResponse.safeParse(body);
    if (!parsed.success) throw new FlexiApiError(200, ['Unexpected write response']);
    const results = parsed.data.winstrom.results ?? [];
    if (parsed.data.winstrom.success !== 'true') {
      throw new FlexiApiError(400, collectMessages(parsed.data.winstrom.message, results));
    }
    return results;
  }

  private async send(method: string, url: URL, body?: unknown): Promise<unknown> {
    const res = await this.fetchImpl(url, {
      method,
      headers: {
        Accept: 'application/json',
        Authorization: this.auth,
        'User-Agent': this.userAgent,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json: unknown = await res.json().catch(() => undefined);
    if (!res.ok) {
      const parsed = writeResponse.safeParse(json);
      const msgs = parsed.success
        ? collectMessages(parsed.data.winstrom.message, parsed.data.winstrom.results ?? [])
        : [];
      throw new FlexiApiError(res.status, msgs);
    }
    return json;
  }
}

function collectMessages(message: string | undefined, results: FlexiWriteResult[]): string[] {
  const msgs = results.flatMap((r) => (r.errors ?? []).map((e) => e.message));
  return message ? [message, ...msgs] : msgs;
}
