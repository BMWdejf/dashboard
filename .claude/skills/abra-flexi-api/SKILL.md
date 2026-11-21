---
name: abra-flexi-api
description: Work with the ABRA Flexi (FlexiBee) REST API in this repo — evidences, filters, record identifiers, dry-run writes, and the @repo/client-flexi package (packages/clients/flexi). Use whenever code reads from or writes to ABRA Flexi / FlexiBee accounting.
---

# ABRA Flexi API

Code lives in `packages/clients/flexi/src/`:

- `client.ts`: `FlexiClient` with `list`, `get` and `upsert`
- `ids.ts`: record identifiers, `shoptetExtId`

Official docs: https://podpora.flexibee.eu/cs/collections/2592813-dokumentace-rest-api.
An evidence's fields are listed by the server itself at
`/c/{firma}/{evidence}/properties.json`; read that, not your memory.

## Facts the client relies on

- **URL**: `{server}:{port}/c/{firma}/{evidence}[/{id}][/(filtr)].json`.
  The port is usually 5434. `{firma}` is the company id.
- **Auth**: HTTP Basic with an API user.
- **Reading**: the response is `{ winstrom: { "<evidence>": [ … ], "@rowCount": "N" } }`.
  - Paging with `limit` and `start`; `add-row-count=true` gives the total.
  - `detail=summary|full|custom:a,b` controls which fields come back.
- **Filter**: in the path, in parentheses: `(kod='TRIKO-M')`,
  `(lastUpdate gt '2026-01-01T00:00:00')`. Pass it as `list(evidence, { filter })`;
  the client encodes it.
- **Identifiers**:
  - `123` is the internal id, assigned by Flexi.
  - `code:XYZ` is the record's `kod`.
  - `ext:NAMESPACE:value` is an external id that we assign.
  - In a URL, several ids combine as `[123][code:CZK][ext:SHOP:abc]`.
  - Unknown ids are ignored, but every known id must point at the same record.
- **Writes**: `PUT /c/{firma}/{evidence}.json` with
  `{ winstrom: { "<evidence>": [ record… ] } }`. A record whose `id` matches an
  existing record updates it; otherwise Flexi creates one.
  - The response has `success` ("true"/"false") and `results[]` with `id`, `ref`
    and `errors[]`.
- **Dry run**: `?dry-run=true` validates and saves nothing. `FlexiClient` adds it to
  every write unless constructed with `dryRun: false`, which in apps comes only
  from `FLEXI_DRY_RUN=false`.

## Our conventions

- Everything we create from Shoptet carries `id: ext:SHOPTET:<entity>:<shoptetId>`
  (`shoptetExtId`). That is the mapping key: re-running a sync updates the
  record instead of duplicating it. Never match records on name or amount.
- References to other records use identifiers, not internal ids:
  `mena: 'code:CZK'`, `stat: 'code:CZ'`, `cenik: 'code:<product code>'`.
- Develop against a **copy of the company** or the demo server. Never against
  the live accounting company.

## Facts found on the demo (11/2026)

- The public demo (`https://demo.flexibee.eu:5434`, company `demo`, user
  `winstrom`/`winstrom`) answers `Request blocked` to the User-Agent `node`.
  `FlexiClient` sends `dashboard-flexi-client/0.1` (option `userAgent`).
- Everything is a string; empty = `""`. A reference comes as `code:X` plus
  `<field>@ref` = `/c/demo/<evidence>/<id>.json` (the internal id).
- Filters accept ISO timestamps with `Z`: `(lastUpdate gte '2026-11-18T18:00:00.000Z')`.
  `order=id` and `limit=0` (= all) work.
- `cenik.sumStavMj` = sum of `skladova-karta.stavMJ` of the current period, but
  `cenik.lastUpdate` does not change when stock moves: read the cards.
- Code lists may repeat `kod` (two `sklad` with `NOVÉ0`); `cenik` and `adresar` don't.
- Stock movements: `skladovy-pohyb-polozka` (`mnozMjPrijem`, `mnozMjVydej`,
  `datVyst`, `storno`). Without `storno = true` lines their sum equals the stock;
  with them it doesn't. Initial balances typed by hand into a period are not
  movements, so absolute sums may differ (demo `DRÁT`), changes over time don't.
- Changes API (`/changes.json?start=<v>`): `@globalVersion`, `next`, entries with
  `@operation` create/update/delete. `changes/status.json` says if it is on.
- Every request we use is in the Postman workspace and collection
  "Dashboard Flexibee API" (environment "Flexi demo").

## Mirror sync (Flexi → Neon)

- Pure mapping and the run: `packages/core/sync/src/flexi-mirror/` (`evidences.ts`
  fields and filters, `map.ts`, `run.ts`). Fixtures from the demo: `fixtures/demo-records.json`.
- Run it: `pnpm --filter api sync:flexi [--full]`, or `POST /sync/flexi[?full=true]`
  and `GET /sync/flexi/cron` on the API with `Authorization: Bearer $SYNC_API_TOKEN`.
- Read-only towards Flexi; the client stays in dry-run.
- Stock history backfill (`movements.ts`): once, on the first run (or with
  `--backfill-history[=days]`), the history is rebuilt 400 days back from
  movements: stock after day D = current stock − Σ changes after D. Written only
  before each product's first real history row.

## Product edits (dashboard → Flexi)

- The product detail page (`apps/web/app/products/[id]`) saves through a server
  action → `PATCH /products/:flexiId` on our API (bearer `SYNC_API_TOKEN`); the web
  app never calls Flexi itself. It needs `API_URL` and `SYNC_API_TOKEN` in `apps/web`.
- Allowed changes and the `cenik` record: `productChangesSchema` / `buildCenikUpdate`
  in `packages/core/sync/src/flexi-mirror/write.ts` (`nazev`, `nakupCena`,
  `cenaZakl`, `typSzbDphK`, `skupZboz`, `exportNaEshop`).
- The API's writer follows `FLEXI_DRY_RUN` (default `true`): the UI then says the
  change was only validated. With it `false`, the API re-reads that one product
  into the mirror (`syncOneProduct`); `POST /products/:flexiId/sync` does the same
  on demand. Flexi 4xx errors come back as 422 with Flexi's messages.

## Evidences we use

| Evidence | What | Notes |
|---|---|---|
| `objednavka-prijata` | received order | lines in `polozkyObchDokladu` |
| `adresar` | customers and suppliers | `ic`, `dic` |
| `cenik` | price list (products) | `kod` = Shoptet product code; mirrored to Neon |
| `skupina-zbozi`, `merna-jednotka`, `sklad`, `typ-atributu`, `ucetni-obdobi` | code lists | mirrored whole every run |
| `atribut`, `odberatel`, `dodavatel`, `priloha` | product attributes, prices, attachments | mirrored (only rows linked to `cenik`) |
| `skladova-karta` / `skladovy-pohyb` | stock | read-only; cards of the current period are mirrored |
| `faktura-vydana` | issued invoice | ESCALATE: accounting document |

## Never

- Write with `dryRun: false` from tests, the factory's checks or local scripts.
- Delete records. If something must be undone, a human does it in Flexi.
- Log the API password.
