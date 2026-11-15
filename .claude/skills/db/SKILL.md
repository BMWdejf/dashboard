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
> `check-types` run `prisma generate`). First migration:
> `20261115230000_examples_data`. Config: `prisma.config.ts` reads
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

## Tables planned for the integrations

- `WebhookEvent`: `(source, eventInstance, event)` unique, for idempotency.
- `IdMapping`: `(entity, shoptetId)` unique → Flexi `ext:` id.
- `SyncRun`: start, end, status, counts, error summary.
- `ScrapeJob` and `ScrapedItem`: extractor id, URL, data `Json`, `scrapedAt`.
- `AccessGrant`: e-mail → role, for invite-only login (see `auth`).

Money is stored as `Decimal`, never `Float`. Timestamps are `DateTime @db.Timestamptz`.

## Tests

- Unit tests (in `checks.sh`) don't touch a database. Keep logic in
  `@repo/core-*` pure, and mock the repository functions in `apps/api`.
- DB tests are `*.db.spec.ts`. They run against a throwaway Neon branch
  (`DATABASE_URL` set), are excluded from the default `jest` run, and clean up
  after themselves.
