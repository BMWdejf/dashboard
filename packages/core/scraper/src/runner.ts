import type { Browser, Page } from 'playwright';
import type { z } from 'zod';

import { hostAllowed, isPrivateHost, parseHttpUrl } from './network';
import { parseRobots, type Robots } from './robots';

/**
 * One extractor per website. It gets a loaded page and returns plain data;
 * `schema` validates it so a changed site layout fails loudly instead of
 * storing garbage.
 */
export interface SiteExtractor<S extends z.ZodType = z.ZodType> {
  /** Stable id, e.g. "example-shop". Used for logs and storage. */
  id: string;
  /** Hostnames this extractor may visit. Any other URL is refused. */
  hosts: string[];
  schema: S;
  extract(page: Page, url: URL): Promise<unknown>;
}

export type ScrapeResult<T> =
  | { url: string; ok: true; data: T }
  | { url: string; ok: false; error: string };

export interface ScrapeOptions {
  /** Returns a browser; defaults to Playwright's headless Chromium. */
  launch?: () => Promise<Browser>;
  userAgent?: string;
  /** Minimum pause between requests to the same host. */
  minDelayMs?: number;
  /** Fetches robots.txt text for an origin; return undefined when there is none. */
  fetchRobots?: (origin: string) => Promise<string | undefined>;
  navigationTimeoutMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function defaultFetchRobots(origin: string): Promise<string | undefined> {
  // Don't follow redirects: a redirect could point at a host outside the allow-list.
  const res = await fetch(`${origin}/robots.txt`, { redirect: 'manual' });
  return res.status === 200 ? res.text() : undefined;
}

async function defaultLaunch(): Promise<Browser> {
  const { chromium } = await import('playwright');
  return chromium.launch({ headless: true });
}

export async function scrape<S extends z.ZodType>(
  extractor: SiteExtractor<S>,
  urls: string[],
  opts: ScrapeOptions = {},
): Promise<ScrapeResult<z.infer<S>>[]> {
  const userAgent = opts.userAgent ?? 'dashboard-scraper/0.1';
  const sleep = opts.sleep ?? defaultSleep;
  const fetchRobots = opts.fetchRobots ?? defaultFetchRobots;
  const robotsByOrigin = new Map<string, Robots>();
  const results: ScrapeResult<z.infer<S>>[] = [];

  const browser = await (opts.launch ?? defaultLaunch)();
  const context = await browser.newContext({ userAgent });
  try {
    // Guard every request the browser makes, not only the URLs we start from:
    // - documents (navigations, frames) must stay on the extractor's hosts,
    //   and each redirect hop is checked before the browser follows it;
    // - subresources (images, fonts, scripts from a CDN) may come from other
    //   hosts, but never from loopback, private or link-local addresses.
    await context.route('**/*', async (route) => {
      const req = route.request();
      const target = parseHttpUrl(req.url());
      if (!target) {
        return /^(data|blob):/.test(req.url()) ? route.continue() : route.abort('blockedbyclient');
      }
      if (isPrivateHost(target.hostname)) return route.abort('blockedbyclient');
      if (!req.isNavigationRequest()) return route.continue();
      if (!hostAllowed(extractor.hosts, req.url())) return route.abort('blockedbyclient');

      // Playwright doesn't route redirect hops, so fetch without following
      // redirects, check Location, and hand the response back to the browser.
      // Its follow-up request comes through this handler again.
      let response;
      try {
        response = await route.fetch({ maxRedirects: 0 });
      } catch {
        return route.abort('failed');
      }
      const status = response.status();
      if (status >= 300 && status < 400) {
        const location = response.headers()['location'];
        let next: string | undefined;
        try {
          next = location ? new URL(location, req.url()).toString() : undefined;
        } catch {
          next = undefined;
        }
        if (!next || !hostAllowed(extractor.hosts, next)) {
          return route.abort('blockedbyclient');
        }
      }
      return route.fulfill({ response });
    });
    let first = true;
    for (const raw of urls) {
      let url: URL;
      try {
        url = new URL(raw);
      } catch {
        results.push({ url: raw, ok: false, error: 'invalid URL' });
        continue;
      }
      if (url.protocol !== 'https:' && url.protocol !== 'http:') {
        results.push({ url: raw, ok: false, error: `protocol ${url.protocol} not allowed` });
        continue;
      }
      if (!extractor.hosts.includes(url.hostname)) {
        results.push({ url: raw, ok: false, error: `host ${url.hostname} not allowed` });
        continue;
      }

      let robots = robotsByOrigin.get(url.origin);
      if (!robots) {
        robots = parseRobots((await fetchRobots(url.origin)) ?? '', userAgent);
        robotsByOrigin.set(url.origin, robots);
      }
      if (!robots.isAllowed(url.pathname + url.search)) {
        results.push({ url: raw, ok: false, error: 'disallowed by robots.txt' });
        continue;
      }

      if (!first) {
        const delay = Math.max(opts.minDelayMs ?? 2000, (robots.crawlDelaySeconds ?? 0) * 1000);
        await sleep(delay);
      }
      first = false;

      const page = await context.newPage();
      try {
        await page.goto(url.toString(), {
          waitUntil: 'domcontentloaded',
          timeout: opts.navigationTimeoutMs ?? 30_000,
        });
        if (!hostAllowed(extractor.hosts, page.url())) {
          throw new Error(`navigated outside allowed hosts: ${new URL(page.url()).hostname}`);
        }
        const extracted = await extractor.extract(page, url);
        // The page's own scripts may navigate while we extract; drop the result
        // unless we are still on an allowed host.
        if (!hostAllowed(extractor.hosts, page.url())) {
          throw new Error(`navigated outside allowed hosts: ${new URL(page.url()).hostname}`);
        }
        const parsed = extractor.schema.safeParse(extracted);
        results.push(
          parsed.success
            ? { url: raw, ok: true, data: parsed.data }
            : { url: raw, ok: false, error: `schema: ${parsed.error.message}` },
        );
      } catch (e) {
        results.push({ url: raw, ok: false, error: e instanceof Error ? e.message : String(e) });
      } finally {
        await page.close();
      }
    }
  } finally {
    await context.close();
    await browser.close();
  }
  return results;
}
