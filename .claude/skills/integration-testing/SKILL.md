---
name: integration-testing
description: How to test code that talks to Shoptet, ABRA Flexi or scraped websites in this repo without calling them — mocked fetch, fixtures, fake browsers. Use when writing or fixing tests in packages/clients/*, packages/core/* or integration modules in apps/api.
---

# Testing integrations offline

`factory/checks.sh` runs every package's `test` script. These tests must pass
on a laptop with no network and no credentials, so:

- **No live calls.** Never call Shoptet, Flexi or a scraped site from a test.
- **Inject the I/O.** Every client takes `fetch` in its options, and `scrape`
  takes `launch`, `fetchRobots` and `sleep`. Tests pass `jest.fn()` versions;
  see `packages/clients/*/src/client.spec.ts` and
  `packages/core/scraper/src/runner.spec.ts`.
- **Fixtures are real responses**, copied once from the live API or site
  into `src/__fixtures__/`, with personal data replaced (names, emails,
  addresses, IČ). Keep them small.
- **Time doesn't pass.** Retries and delays take an injected `sleep`. Assert
  on the delay asked for, and don't wait.
- **Writes to Flexi** are asserted on the request: the URL contains
  `dry-run=true` and the body has the expected `winstrom` payload.

Run a package's tests with `pnpm --filter <name> test`, or all of them with `pnpm test`.

## Contract checks against the real services

When a fixture might be stale, re-record it by hand with a test token, against
the test e-shop or a copy of the Flexi company. Commit the new fixture with the
schema change it caused. That is a manual step, never part of `checks.sh`.
