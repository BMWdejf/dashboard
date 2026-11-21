---
name: db
description: Work with this repo's Postgres database on Neon through Prisma — the @repo/core-db package (packages/core/db), schema changes and migrations, Neon branches for development and factory jobs, connection strings, and DB tests. Use for any task that reads or writes persistent data or changes the schema.
---

# Database: Neon Postgres + Prisma

General Neon knowledge is in the `neon:neon-postgres` and
`neon:neon-postgres-branches` skills, and the Neon MCP tools can create
branches, run SQL and prepare migrations. This skill holds **this project's**
decisions.

> Status: `packages/core/db` exists (Prisma 7.10.1, `@prisma/adapter-neon`).
> Generated client: `src/generated/prisma` (gitignored; `build` and
> `check-types` run `prisma generate`). Migrations:
> `20261115230000_examples_data`, `20261115233000_user_preferences` (theme per
> Neon Auth user id), `20261119120000_user_preferences_language_price`
> (language, price mode, product settings JSON), `20261119120100_flexi_cenik_mirror`
> (read-only mirror of ABRA Flexi `cenik` and related evidences, tables
> `flexi_*`, plus `flexi_cenik_stav_historie`, `flexi_sync_run`,
> `flexi_sync_state`), `20261121090000_shoptet_product_settings`,
> `20261121180000_supplier_feeds` (`supplier_feed`, `supplier_feed_item`). Config: `prisma.config.ts` reads
> `DATABASE_URL_UNPOOLED` from the root `.env.local` for migrations.
> Keep pure mapping in `src/dashboard.ts` (tested) apart from queries, because
> Jest can't load the generated client.

## Decisions

- **ORM**: Prisma. Check the installed major version and follow its docs for
  `prisma.config.ts`, generator output and driver adapters; don't copy setup
  from memory.
- **Package**: `packages/core/db` (`@repo/core-db`) owns:
  - `prisma/schema.prisma` and `prisma/migrations/`;
  - an exported, lazily created client (`getDb()`);
  - small repository functions (`recordWebhookEvent`, `upsertIdMapping`, …).

  Apps import those functions and never construct their own Prisma client.
- **One database, one schema we own**: `public`. The `neon_auth` schema
  belongs to Neon Auth (see `auth`). Prisma never migrates it. Our tables
  reference a user by `userId String` (the Neon Auth user id), with no
  Prisma-managed foreign key into `neon_auth`.

## Connection strings

| Variable | Use |
|---|---|
| `DATABASE_URL` | pooled connection (host with `-pooler`). Used by apps and the worker at runtime. |
| `DIRECT_URL` | direct, unpooled connection. Used for `prisma migrate`. |

Both come from `neon connection-string` or the Neon console for the right
**branch**. Add them to `packages/core/config` as `dbEnv`. Never commit them,
and never put them in fixtures.

## Branches

| Branch | Who | Notes |
|---|---|---|
| `main` | production | migrations only through `prisma migrate deploy` from CI or a human |
| `dev-<name>` | each developer | created from `main`, reset with "reset from parent" when it drifts |
| `job-<job-id>` | a factory job that needs a DB | created from `main` at job start, deleted when the job ends |

A branch is a copy-on-write copy of its parent, including data and Neon Auth
state. Use one to try a migration on production-shaped data, never `main` itself.

## Schema changes

1. Edit `prisma/schema.prisma`.
2. Generate a migration against your branch:
   `pnpm --filter @repo/core-db exec prisma migrate dev --name <what>`.
3. Read the generated SQL. Flag anything destructive: dropped columns or
   tables, type changes, `NOT NULL` without a default on a populated table.
4. Commit schema and migration together. Never edit an applied migration;
   add a new one.
5. Never run `migrate reset`, `db push` or hand-written DDL against `main`.

The approver escalates every migration. Destructive ones need a written
rollback or backfill plan in the PR.

## Flexi mirror (`flexi_*`)

- Written only by the sync (`createFlexiMirrorStore` in `src/flexi-mirror.ts`,
  SQL in `src/flexi-mirror-sql.ts`); the app only reads. Flexi is the source of truth.
- Keys: our UUID `id`, Flexi `flexi_id` (unique, upsert key). `kod` is unique
  only on `flexi_cenik`; Flexi code lists may repeat a code (demo: two warehouses `NOVÉ0`).
- A product deleted in Flexi gets `deleted_at` and its `kod` gets `~deleted~<flexi_id>`
  (Flexi may reuse the code); other rows are deleted.
- Stock: `flexi_cenik.sum_stav_mj` is recomputed from the current period's
  `flexi_skladova_karta` after every run (Flexi's `lastUpdate` on `cenik` does not
  change when stock moves). A row in `flexi_cenik_stav_historie` is appended when
  a product's total changes; KPI trends (Settings → Products) read it.
  It starts with a one-off backfill from Flexi stock movements
  (`BACKFILL_HISTORY_SQL`), so trends and sparklines have a year of data at once.
- Prices `numeric(20,6)`, quantities `numeric(18,6)`: the demo has prices of
  1.4·10¹¹ with 6 decimals.
- Queries for the Products page: `src/products.ts` (pure parts in `product-logic.ts`).

## Supplier XML feeds (`supplier_feed*`)

- `supplier_feed`: one row per feed URL (unique): dialect, item element, the
  tag → column `mapping` (jsonb, validated by `validateFeedMapping` in
  `@repo/core-sync`), `import_interval_minutes` (null = by hand),
  `next_import_at`, and the last import's status, error (`{ code, params }`
  JSON, safe to show) and stats.
- `supplier_feed_item`: the feed's products in columns named like `flexi_cenik`,
  unique `(feed_id, kod)`; tags the mapping leaves out stay in `raw`.
  `cenik_id` (set null on delete) is for pairing on the Products page; the
  import never touches it. Items missing from a later import get `removed_at`.
- Written only by the import (`createSupplierFeedStore` in
  `src/supplier-feeds.ts`, SQL in `src/supplier-feed-sql.ts`): one transaction,
  upserts in chunks of 500. Nothing goes to Flexi.

## Shoptet output settings

- `shoptet_product_settings` (one row per `flexi_cenik`, cascade): per-field
  overrides of what goes to Shoptet (`overrides` jsonb: `title`, `priceGross`,
  `stock`, `category`), `stock_auto_sync`, `safety_buffer`. Written by the product
  detail page; validation and the computed output in `src/shoptet-logic.ts`
  (`@repo/core-db/shoptet`, safe for client components), queries in
  `src/shoptet-settings.ts`.

## Tables planned for the integrations

- `WebhookEvent`: `(source, eventInstance, event)` unique, for idempotency.
- `IdMapping`: `(entity, shoptetId)` unique → Flexi `ext:` id.
- `SyncRun`: done for Flexi as `FlexiSyncRun` (`flexi_sync_run`).
- `ScrapeJob` and `ScrapedItem`: extractor id, URL, data `Json`, `scrapedAt`.
- `AccessGrant`: e-mail → role, for invite-only login (see `auth`).

Money is stored as `Decimal`, never `Float`. Timestamps are `DateTime @db.Timestamptz`.

## Tests

- Unit tests (in `checks.sh`) don't touch a database. Keep logic in
  `@repo/core-*` pure, and mock the repository functions in `apps/api`.
- DB tests are `*.db.spec.ts`. They run against a throwaway Neon branch
  (`DATABASE_URL` set), are excluded from the default `jest` run, and clean up
  after themselves.
