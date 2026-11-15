import { describe, expect, it, jest } from '@jest/globals';
import type { Browser, Page } from 'playwright';
import { z } from 'zod';

import { scrape, type SiteExtractor } from './runner';

function fakeBrowser(titles: Record<string, string>) {
  const visited: string[] = [];
  let current = '';
  const page = {
    goto: jest.fn(async (u: string) => {
      visited.push(u);
      current = u;
      if (!(u in titles)) throw new Error('net::ERR_NAME_NOT_RESOLVED');
      return null;
    }),
    title: jest.fn(async () => titles[current] ?? ''),
    close: jest.fn(async () => {}),
  };
  const context = { newPage: jest.fn(async () => page), close: jest.fn(async () => {}) };
  const browser = { newContext: jest.fn(async () => context), close: jest.fn(async () => {}) };
  return { browser: browser as unknown as Browser, visited, closed: browser.close };
}

const extractor: SiteExtractor<z.ZodObject<{ title: z.ZodString }>> = {
  id: 'example',
  hosts: ['shop.example.com'],
  schema: z.object({ title: z.string().min(1) }),
  extract: async (page: Page) => ({ title: await page.title() }),
};

describe('scrape', () => {
  it('extracts, validates, respects hosts and robots, waits between pages', async () => {
    const { browser, visited, closed } = fakeBrowser({
      'https://shop.example.com/a': 'Produkt A',
      'https://shop.example.com/b': '',
    });
    const sleep = jest.fn(async (_ms: number) => {});

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
});
