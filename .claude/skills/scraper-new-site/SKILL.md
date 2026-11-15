---
name: scraper-new-site
description: Add or fix a website extractor for @repo/core-scraper (packages/core/scraper) using Playwright — exploring the page, writing the extractor, saving fixtures and tests, and respecting robots.txt and site terms. Use when asked to scrape a new site or when an existing extractor breaks.
---

# Add a scraper for a site

The runtime is `packages/core/scraper/src/runner.ts`. `scrape(extractor, urls)`
does the following:

- refuses hosts outside `extractor.hosts` and anything that isn't http(s);
- obeys `robots.txt`, including `Crawl-delay`;
- waits at least `minDelayMs` between pages;
- validates the output with `extractor.schema`.

You only write the extractor.

## 0. Is it allowed?

Before writing code, check and note in the PR:

- the site's terms of use;
- `robots.txt`;
- whether an official API or feed exists (for e-shops, often an XML product
  feed for Heureka or Zboží). If one exists, prefer it over scraping.

Scrape only public pages. Don't log in, and don't bypass CAPTCHAs or bot protection.

## 1. Explore

Use the Playwright MCP tools (`browser_navigate`, `browser_snapshot`) to open
one or two target pages. Find stable selectors, in this order of preference:

1. `data-*` attributes and JSON-LD (`script[type="application/ld+json"]`);
2. `itemprop` microdata;
3. roles and labels (`getByRole`);
4. CSS classes, only as a last resort.

## 2. Write the extractor

`packages/core/scraper/src/sites/<site-id>.ts`:

```ts
import { z } from 'zod';
import type { SiteExtractor } from '../runner';

const schema = z.object({
  name: z.string().min(1),
  price: z.number().positive(),
  currency: z.string().length(3),
  inStock: z.boolean(),
});

export const exampleShop: SiteExtractor<typeof schema> = {
  id: 'example-shop',
  hosts: ['www.example-shop.cz'],
  schema,
  async extract(page) {
    const ld = await page.locator('script[type="application/ld+json"]').first().textContent();
    // parse, normalise "1 299,00 Kč" → 1299 here, never in the caller
    return { /* … */ };
  },
};
```

- Return plain data. Normalise prices, decimal commas and whitespace inside the extractor.
- A strict schema is the alarm: when the site changes, validation fails
  instead of storing wrong prices.

## 3. Test

- Save the page as `src/sites/__fixtures__/<site-id>/<case>.html`.
- Write a test that loads it with `page.setContent(html)` in a real Chromium
  and runs `extract`.
  - Browser tests need `pnpm exec playwright install chromium`.
  - Keep them in `*.browser.spec.ts`; `checks.sh` doesn't run them.
- Test the pure normalisation helpers in plain `*.spec.ts` files, which run in checks.

## 4. Register

Export the extractor from `src/sites/index.ts` and the package index. Run it
from the worker, not from the API process.
