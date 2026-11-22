# AGENTS.md

A Turborepo monorepo (pnpm workspaces):

- `apps/web`: Next.js App Router frontend. `/` is the dashboard, `/products` the
  products from the Flexi mirror and `/settings/*` the user's settings; all need a session (`proxy.ts` redirects to
  `/auth/sign-in`). E-mail sign-up/sign-in with Neon Auth under `/auth/*`.
- `apps/api`: NestJS API (built with SWC, tested with Jest). Serves `/links` and
  `/sync/flexi` (Flexi → Neon product mirror; needs `SYNC_API_TOKEN`) and
  `/products/:flexiId` (product edits to Flexi, dry-run unless `FLEXI_DRY_RUN=false`;
  the web app calls it with `API_URL` + `SYNC_API_TOKEN`), and
  `/integrations/checks/{flexi,shoptet,feed}` (read-only pre-flight checks for
  /integrations/new; public addresses only, a LAN Flexi needs
  `FLEXI_CHECK_ALLOW_PRIVATE=true`), and `/supplier-feeds` (supplier XML feeds:
  mapping preview, save, import into `supplier_feed_item`; due feeds are imported
  every minute unless `SUPPLIER_FEED_SCHEDULER=false`, or via
  `GET /supplier-feeds/cron`; items go to Flexi by hand from
  `/integrations/feeds/[id]` via `/supplier-feeds/:id/flexi/{create,update}`,
  dry-run unless `FLEXI_DRY_RUN=false`). Manual run:
  `pnpm --filter api sync:flexi [--full]`.
- `packages/api`: shared DTOs and entities (`@repo/api`).
- `packages/ui`: shared React components (`@repo/ui`).
- `packages/eslint-config`, `packages/typescript-config`, `packages/jest-config`:
  shared tooling config.
- `packages/clients/*`: typed clients for external services, one package per
  service. They take `fetch` as an option and never read `process.env`.
  - `shoptet` (`@repo/client-shoptet`): Shoptet REST API + webhook signature.
  - `flexi` (`@repo/client-flexi`): ABRA Flexi REST API; writes are dry-run by default.
- `packages/core/*`: domain logic shared by the API and future workers.
  - `config` (`@repo/core-config`): zod-validated env (`loadEnv`, `shoptetEnv`,
    `flexiEnv`, `scraperEnv`, `authEnv`, `dbEnv`).
  - `db` (`@repo/core-db`): Prisma 7 + Neon (`getDb()`), migrations in
    `prisma/migrations`, and query functions. `examples_data` holds the
    dashboard's example data (`getDashboardExamples()`); reseed it with
    `pnpm --filter @repo/core-db db:seed-examples`.
  - `sync` (`@repo/core-sync`): pure Shoptet → Flexi mapping functions, the
    Flexi → Neon mirror sync (`flexi-mirror/`), and supplier XML feeds
    (`supplier-feed/`: streaming item parser, tag → column mapping; the pure
    mapping is also exported as `@repo/core-sync/feed-mapping` for the web).
  - `scraper` (`@repo/core-scraper`): Playwright runner (host allow-list,
    robots.txt, delays, schema validation) and per-site extractors.

A new client goes in `packages/clients/<service>`, named `@repo/client-<service>`.
A new domain package goes in `packages/core/<name>`, named `@repo/core-<name>`.
Copy the `package.json` scripts, tsconfigs, eslint and jest config from a sibling.

## Project skills

`.claude/skills/` holds this repo's conventions. Read the matching one before you
change an area:

- `nest-module`: anything in `apps/api`.
- `next-page`: anything in `apps/web` or `packages/ui`.
- `new-package`: creating a package.
- `db`: Neon Postgres + Prisma (`packages/core/db`), migrations, branches.
- `auth`: Neon Auth with Google, invite-only access, roles, protected routes.
- `design`: building UI from the Figma design (tokens, components, comparing
  the result).
- `shoptet-api`, `abra-flexi-api`, `sync-mapping`, `scraper-new-site`,
  `integration-testing`: the integrations (see below).

## Integrations

Read the skill for the area before changing it: `shoptet-api`,
`abra-flexi-api`, `sync-mapping`, `scraper-new-site`, `integration-testing`
(in `.claude/skills/`).

- Tests never call Shoptet, Flexi or a scraped site. Inject `fetch` / `launch`
  and use fixtures.
- Never write to ABRA Flexi with dry-run off outside a deliberate, human-run sync.
- Secrets come only from env (see `packages/core/config`), never from code or fixtures.
- Playwright browser tests (`*.browser.spec.ts`) need
  `pnpm --filter @repo/core-scraper exec playwright install chromium`, and are
  not part of the checks.

## Setup

A fresh checkout needs only:

```bash
pnpm install --frozen-lockfile
```

Node `>=26.12.0`, pnpm 10.

Env files are never committed. The repo is linked to the Neon project
`admin-dashboard-postgres` (`neon.ts`, `.neon`), database `dashboard`. To get them:

```bash
neon env pull -s auth                          # .env.local (root)
neon env pull -s auth --file apps/web/.env.local
```

Then add `NEON_AUTH_COOKIE_SECRET` (`openssl rand -base64 32`) to
`apps/web/.env.local`, and `DATABASE_URL` / `DATABASE_URL_UNPOOLED` for the
`dashboard` database (`neon connection-string main --database-name dashboard
[--pooled]`) to the root `.env.local`. The branch has several databases, so
`neon env pull` can't pick the database itself.

For the web → API calls (/integrations/new checks, product edits, sync), add
the same `SYNC_API_TOKEN` (`openssl rand -hex 32`) to both the root
`.env.local` (read by `pnpm --filter api dev`) and `apps/web/.env.local`.

## Dev servers

- Everything: `pnpm dev` (web on 3001, API on 3000).
- Web only, on a given port: `pnpm --filter web exec next dev --port <port>`
  (run `pnpm --filter @repo/api build` first if `packages/api` has no `dist`).
- The API listens on port 3000 (hard-coded in `apps/api/src/main.ts`). The web
  app doesn't call it; the dashboard reads `examples_data` from Neon directly.
- `.env.local` never overrides variables already set in the shell. If your
  shell exports `DATABASE_URL` or `NEON_AUTH_*` for another project, unset
  them before `pnpm dev`, or the app talks to the wrong database.

## Validation

These are exactly what `factory/checks.sh` runs:

```bash
pnpm install --frozen-lockfile --prefer-offline
pnpm lint
pnpm check-types
pnpm test
pnpm build
```

## Software factory

`/factory run` builds every open GitHub issue labeled `factory` through
intake → spec → build → gate → review → approve, one PR per issue. State is in
`factory/jobs/` (gitignored); `factory/bin/job` is its only writer. Checks:
`factory/checks.sh`. Dashboard: `cd factory && python3 -m http.server`, then
open http://localhost:8000/dashboard.html.

Each job works in its own git worktree, a full checkout of the repo at
`.worktrees/<job-id>` (gitignored). A tool run from the repo root that doesn't
read `.gitignore` sees those copies too; exclude `.worktrees/` in its config.
