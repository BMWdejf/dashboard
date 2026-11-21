import { SaxesParser } from 'saxes';

import { allOk, networkFailure, resolveStep, skipped } from './net';
import type { CheckDeps, CheckResult, CheckStep, FeedCheckInfo, FeedCheckInput, FeedDialect } from './types';

/** Larger feeds are rejected rather than read to the end. */
export const MAX_FEED_BYTES = 100 * 1024 * 1024;
const MAX_REDIRECTS = 3;

export interface XmlInspection {
  error: { message: string; line: number; column: number } | null;
  root: string | null;
  rootAttributes: Record<string, string>;
  /** Element name → count at depth 2 and 3 (root is depth 1). */
  depth2: Map<string, number>;
  depth3: Map<string, number>;
  /** Some element name contains a "g:" prefix (Google Merchant). */
  googleNs: boolean;
}

/** Streams XML text through a non-validating parser; stops at the first error. */
export async function inspectXml(chunks: AsyncIterable<string>): Promise<XmlInspection> {
  const out: XmlInspection = {
    error: null,
    root: null,
    rootAttributes: {},
    depth2: new Map(),
    depth3: new Map(),
    googleNs: false,
  };
  const parser = new SaxesParser({ xmlns: false });
  let depth = 0;
  parser.on('error', (e) => {
    out.error ??= { message: e.message.replace(/^.*?:\d+:\d+: /, ''), line: parser.line, column: parser.column };
  });
  parser.on('opentag', (tag) => {
    depth++;
    const name = tag.name;
    if (depth === 1) {
      out.root = name;
      out.rootAttributes = Object.fromEntries(Object.entries(tag.attributes).map(([k, v]) => [k, String(v)]));
    } else if (depth === 2) out.depth2.set(name, (out.depth2.get(name) ?? 0) + 1);
    else if (depth === 3) out.depth3.set(name, (out.depth3.get(name) ?? 0) + 1);
    if (name.startsWith('g:')) out.googleNs = true;
    if (tag.isSelfClosing) depth--;
  });
  parser.on('closetag', (tag) => {
    if (!tag.isSelfClosing) depth--;
  });

  for await (const chunk of chunks) {
    parser.write(chunk);
    if (out.error) return out;
  }
  parser.close();
  if (!out.error && !out.root) out.error = { message: 'No root element.', line: 1, column: 0 };
  return out;
}

const top = (m: Map<string, number>): [string, number] | null =>
  [...m.entries()].sort((a, b) => b[1] - a[1])[0] ?? null;

/** Which known feed format the structure looks like, and its item element. */
export function detectDialect(x: XmlInspection): { dialect: FeedDialect; itemElement: string | null; items: number } {
  const root = (x.root ?? '').toLowerCase();
  const count = (map: Map<string, number>, name: string) =>
    [...map.entries()].filter(([k]) => k.toLowerCase() === name).reduce((s, [, n]) => s + n, 0);

  if (root === 'shop' && count(x.depth2, 'shopitem') > 0) {
    const zbozi = Object.values(x.rootAttributes).some((v) => v.includes('zbozi.cz'));
    return { dialect: zbozi ? 'zbozi' : 'shopitem', itemElement: 'SHOPITEM', items: count(x.depth2, 'shopitem') };
  }
  if (root === 'rss' && count(x.depth3, 'item') > 0) {
    return { dialect: x.googleNs ? 'google' : 'custom', itemElement: 'item', items: count(x.depth3, 'item') };
  }
  if (root === 'feed' && x.googleNs && count(x.depth2, 'entry') > 0) {
    return { dialect: 'google', itemElement: 'entry', items: count(x.depth2, 'entry') };
  }
  if (root === 'channel' && count(x.depth2, 'item') > 0) {
    return { dialect: 'mergado', itemElement: 'ITEM', items: count(x.depth2, 'item') };
  }
  // Custom: the most repeated element under the root, or one level lower when
  // the root holds a single wrapper.
  const second = top(x.depth2);
  const third = top(x.depth3);
  const pick = second && second[1] > 1 ? second : third && third[1] > 1 ? third : second;
  return { dialect: 'custom', itemElement: pick?.[0] ?? null, items: pick?.[1] ?? 0 };
}

/** Encoding from Content-Type or the XML declaration; utf-8 when unknown or unsupported. */
export function feedEncoding(contentType: string | null, head: Uint8Array): string {
  const fromHeader = /charset=["']?([\w-]+)/i.exec(contentType ?? '')?.[1];
  const decl = /<\?xml[^>]*encoding=["']([\w-]+)["']/i.exec(new TextDecoder('latin1').decode(head.slice(0, 200)))?.[1];
  const name = (decl ?? fromHeader ?? 'utf-8').toLowerCase();
  try {
    new TextDecoder(name);
    return name;
  } catch {
    return 'utf-8';
  }
}

/** Decodes the body with a byte limit; throws 'tooLarge' past it. */
export async function* decodeBody(
  body: ReadableStream<Uint8Array>,
  contentType: string | null,
  counter: { bytes: number; encoding: string },
): AsyncGenerator<string> {
  let decoder: TextDecoder | null = null;
  for await (const chunk of body as unknown as AsyncIterable<Uint8Array>) {
    counter.bytes += chunk.byteLength;
    if (counter.bytes > MAX_FEED_BYTES) throw new Error('tooLarge');
    if (!decoder) {
      counter.encoding = feedEncoding(contentType, chunk);
      decoder = new TextDecoder(counter.encoding);
    }
    yield decoder.decode(chunk, { stream: true });
  }
  if (decoder) yield decoder.decode();
}

export type OpenedFeed =
  | { ok: true; res: Response & { body: ReadableStream<Uint8Array> }; url: URL; endpoint: CheckStep }
  | { ok: false; step: CheckStep };

/**
 * GETs a feed from a public address: the host is re-checked on every
 * redirect (at most 3, http(s) only) and the final answer must be 200 with a
 * body. The "endpoint" step either way.
 */
export async function openFeed(input: string, deps: CheckDeps, signal: AbortSignal): Promise<OpenedFeed> {
  let url = new URL(input);
  let res: Response | null = null;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const dns = await resolveStep(url.hostname, deps, false);
    if (dns.status === 'failed') return { ok: false, step: { ...dns, key: 'endpoint' } };
    try {
      res = await deps.fetch(url, {
        headers: { Accept: 'application/xml, text/xml, */*' },
        redirect: 'manual',
        signal,
      });
    } catch (e) {
      const f = networkFailure(e);
      return { ok: false, step: { key: 'endpoint', status: 'failed', code: f.code, params: { reason: f.reason } } };
    }
    const location = res.headers.get('location');
    if (res.status >= 300 && res.status < 400 && location) {
      await res.body?.cancel().catch(() => undefined);
      const next = new URL(location, url);
      if (next.protocol !== 'https:' && next.protocol !== 'http:') {
        return { ok: false, step: { key: 'endpoint', status: 'failed', code: 'badRedirect' } };
      }
      url = next;
      res = null;
      continue;
    }
    break;
  }
  if (!res) return { ok: false, step: { key: 'endpoint', status: 'failed', code: 'tooManyRedirects' } };
  if (!res.ok || !res.body) {
    await res.body?.cancel().catch(() => undefined);
    return { ok: false, step: { key: 'endpoint', status: 'failed', code: 'httpStatus', params: { status: res.status } } };
  }
  const endpoint: CheckStep =
    url.protocol === 'https:'
      ? { key: 'endpoint', status: 'ok', code: 'https', params: { status: res.status } }
      : { key: 'endpoint', status: 'warn', code: 'noTls', params: { status: res.status } };
  return { ok: true, res: res as Response & { body: ReadableStream<Uint8Array> }, url, endpoint };
}

/**
 * Supplier XML feed: the URL resolves to a public address (no LAN, no
 * loopback, re-checked on every redirect), answers 200, the body is
 * well-formed XML, and its format and item count are recognised. Read-only.
 */
export async function checkFeed(input: FeedCheckInput, deps: CheckDeps): Promise<CheckResult<FeedCheckInfo>> {
  const now = deps.now ?? Date.now;
  const started = now();
  const signal = AbortSignal.timeout(deps.timeoutMs ?? 60_000);
  const opened = await openFeed(input.url, deps, signal);
  if (!opened.ok) {
    return { ok: false, steps: [opened.step, skipped('xml'), skipped('dialect')], latencyMs: null, info: null };
  }
  const { res, endpoint } = opened;
  const latencyMs = now() - started;

  const counter = { bytes: 0, encoding: 'utf-8' };
  const parseStart = now();
  let x: XmlInspection;
  try {
    x = await inspectXml(decodeBody(res.body, res.headers.get('content-type'), counter));
  } catch (e) {
    await res.body.cancel().catch(() => undefined);
    const tooLarge = e instanceof Error && e.message === 'tooLarge';
    const xml: CheckStep = tooLarge
      ? { key: 'xml', status: 'failed', code: 'tooLarge', params: { mb: MAX_FEED_BYTES / 1024 / 1024 } }
      : { key: 'xml', status: 'failed', code: networkFailure(e).code };
    return { ok: false, steps: [endpoint, xml, skipped('dialect')], latencyMs, info: null };
  }
  const parseMs = now() - parseStart;

  if (x.error) {
    await res.body.cancel().catch(() => undefined);
    const xml: CheckStep = {
      key: 'xml',
      status: 'failed',
      code: 'malformed',
      params: { line: x.error.line, column: x.error.column, message: x.error.message.slice(0, 160) },
    };
    return { ok: false, steps: [endpoint, xml, skipped('dialect')], latencyMs, info: null };
  }

  const d = detectDialect(x);
  const xml: CheckStep = { key: 'xml', status: 'ok', code: 'wellFormed', params: { root: x.root! } };
  const dialect: CheckStep =
    d.items === 0
      ? { key: 'dialect', status: 'failed', code: 'noItems' }
      : d.dialect === 'custom'
        ? { key: 'dialect', status: 'warn', code: 'custom', params: { element: d.itemElement ?? '?', items: d.items } }
        : { key: 'dialect', status: 'ok', code: 'detected', params: { dialect: d.dialect, items: d.items } };
  const steps = [endpoint, xml, dialect];
  return {
    ok: allOk(steps),
    steps,
    latencyMs,
    info: {
      dialect: d.dialect,
      root: x.root!,
      itemElement: d.itemElement,
      items: d.items,
      bytes: counter.bytes,
      parseMs,
      encoding: counter.encoding,
    },
  };
}
