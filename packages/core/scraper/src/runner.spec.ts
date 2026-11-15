import { describe, expect, it, jest } from '@jest/globals';
import type { Browser, Page, Route } from 'playwright';
import { z } from 'zod';

import { scrape, type SiteExtractor } from './runner';

type RouteHandler = (route: Route) => unknown;

/** Fake browser. `redirects` maps a requested URL to where the page ends up. */
function fakeBrowser(titles: Record<string, string>, redirects: Record<string, string> = {}) {
  const visited: string[] = [];
  let current = '';
  let handler: RouteHandler | undefined;
  const page = {
    goto: jest.fn(async (u: string) => {
      visited.push(u);
      current = redirects[u] ?? u;
      if (!(current in titles)) throw new Error('net::ERR_NAME_NOT_RESOLVED');
      return null;
    }),
    url: jest.fn(() => current),
    title: jest.fn(async () => titles[current] ?? ''),
    close: jest.fn(async () => {}),
  };
  const context = {
    route: jest.fn(async (_pattern: string, h: RouteHandler) => {
      handler = h;
    }),
    newPage: jest.fn(async () => page),
    close: jest.fn(async () => {}),
  };
  const browser = { newContext: jest.fn(async () => context), close: jest.fn(async () => {}) };
  return {
    browser: browser as unknown as Browser,
    visited,
    closed: browser.close,
    route: async (
      url: string,
      navigation: boolean,
      response: { status: number; location?: string } = { status: 200 },
    ) => {
      const r = {
        request: () => ({ url: () => url, isNavigationRequest: () => navigation }),
        abort: jest.fn(async () => {}),
        continue: jest.fn(async () => {}),
        fetch: jest.fn(async (_opts?: { maxRedirects?: number }) => ({
          status: () => response.status,
          headers: () => (response.location ? { location: response.location } : {}),
        })),
        fulfill: jest.fn(async () => {}),
      };
      await handler!(r as unknown as Route);
      return r;
    },
  };
}

const extractor: SiteExtractor<z.ZodObject<{ title: z.ZodString }>> = {
  id: 'example',
  hosts: ['shop.example.com'],
  schema: z.object({ title: z.string().min(1) }),
  extract: async (page: Page) => ({ title: await page.title() }),
};

const noRobots = async () => undefined;
const sleep = jest.fn(async (_ms: number) => {});

describe('scrape', () => {
  it('extracts, validates, respects hosts and robots, waits between pages', async () => {
    const { browser, visited, closed } = fakeBrowser({
      'https://shop.example.com/a': 'Produkt A',
      'https://shop.example.com/b': '',
    });

    const results = await scrape(
      extractor,
      [
        'https://shop.example.com/a',
        'https://shop.example.com/b',
        'https://shop.example.com/private/x',
        'https://evil.example.org/',
        'file:///etc/passwd',
      ],
      {
        launch: async () => browser,
        fetchRobots: async () => 'User-agent: *\nDisallow: /private',
        minDelayMs: 1000,
        sleep,
      },
    );

    expect(results.map((r) => (r.ok ? r.data : r.error))).toEqual([
      { title: 'Produkt A' },
      expect.stringContaining('schema'),
      'disallowed by robots.txt',
      'host evil.example.org not allowed',
      'protocol file: not allowed',
    ]);
    expect(visited).toEqual(['https://shop.example.com/a', 'https://shop.example.com/b']);
    expect(sleep).toHaveBeenCalledWith(1000);
    expect(closed).toHaveBeenCalled();
  });

  it('refuses a page that redirected outside the allowed hosts', async () => {
    const { browser } = fakeBrowser(
      { 'http://169.254.169.254/latest/meta-data': 'secret' },
      { 'https://shop.example.com/go': 'http://169.254.169.254/latest/meta-data' },
    );

    const [result] = await scrape(extractor, ['https://shop.example.com/go'], {
      launch: async () => browser,
      fetchRobots: noRobots,
      sleep,
    });

    expect(result).toEqual({
      url: 'https://shop.example.com/go',
      ok: false,
      error: 'navigated outside allowed hosts: 169.254.169.254',
    });
  });

  describe('request guard', () => {
    async function guard() {
      const fake = fakeBrowser({ 'https://shop.example.com/a': 'A' });
      await scrape(extractor, ['https://shop.example.com/a'], {
        launch: async () => fake.browser,
        fetchRobots: noRobots,
        sleep,
      });
      return fake.route;
    }

    it('aborts navigations to other hosts', async () => {
      const route = await guard();
      expect((await route('https://evil.example.org/', true)).abort).toHaveBeenCalled();
    });

    it('fetches allowed navigations without following redirects', async () => {
      const route = await guard();
      const r = await route('https://shop.example.com/b', true);
      expect(r.fetch).toHaveBeenCalledWith({ maxRedirects: 0 });
      expect(r.fulfill).toHaveBeenCalled();
    });

    it('follows a redirect only to an allowed host', async () => {
      const route = await guard();
      const ok = await route('https://shop.example.com/old', true, {
        status: 301,
        location: '/new',
      });
      expect(ok.fulfill).toHaveBeenCalled();

      const bad = await route('https://shop.example.com/go', true, {
        status: 302,
        location: 'http://169.254.169.254/latest/meta-data',
      });
      expect(bad.abort).toHaveBeenCalled();
      expect(bad.fulfill).not.toHaveBeenCalled();
    });

    it('lets public subresources load but blocks private ones', async () => {
      const route = await guard();
      expect((await route('https://cdn.example.net/img.png', false)).continue).toHaveBeenCalled();
      expect((await route('http://192.168.1.1/admin', false)).abort).toHaveBeenCalled();
      expect((await route('http://localhost:3000/links', false)).abort).toHaveBeenCalled();
      expect((await route('file:///etc/passwd', false)).abort).toHaveBeenCalled();
      expect((await route('data:image/png;base64,AAAA', false)).continue).toHaveBeenCalled();
    });
  });
});
