import { describe, expect, it } from '@jest/globals';

import { parseRobots } from './robots';

const txt = `
User-agent: *
Disallow: /kosik
Disallow: /*?sort=
Allow: /kosik/info$
Crawl-delay: 5

User-agent: badbot
Disallow: /
`;

describe('parseRobots', () => {
  const r = parseRobots(txt, 'dashboard-scraper/0.1');

  it('allows by default and blocks disallowed prefixes', () => {
    expect(r.isAllowed('/produkty/triko')).toBe(true);
    expect(r.isAllowed('/kosik/krok-1')).toBe(false);
  });

  it('supports * and $, longest rule wins', () => {
    expect(r.isAllowed('/produkty?sort=price')).toBe(false);
    expect(r.isAllowed('/kosik/info')).toBe(true);
    expect(r.isAllowed('/kosik/info/x')).toBe(false);
  });

  it('reads crawl-delay', () => {
    expect(r.crawlDelaySeconds).toBe(5);
  });

  it('uses the group for a matching user agent', () => {
    expect(parseRobots(txt, 'BadBot/2').isAllowed('/produkty')).toBe(false);
  });
});
