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

## Evidences we use

| Evidence | What | Notes |
|---|---|---|
| `objednavka-prijata` | received order | lines in `polozkyObchDokladu` |
| `adresar` | customers and suppliers | `ic`, `dic` |
| `cenik` | price list (products) | `kod` = Shoptet product code |
| `skladova-karta` / `skladovy-pohyb` | stock | read-only for us for now |
| `faktura-vydana` | issued invoice | ESCALATE: accounting document |

## Never

- Write with `dryRun: false` from tests, the factory's checks or local scripts.
- Delete records. If something must be undone, a human does it in Flexi.
- Log the API password.
