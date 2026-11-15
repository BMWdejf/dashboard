---
name: shoptet-api
description: Work with the Shoptet REST API in this repo — add or change an endpoint in @repo/client-shoptet (packages/clients/shoptet), handle Shoptet webhooks, pagination, rate limits or auth. Use whenever code calls Shoptet or a task mentions Shoptet orders, products, stock or webhooks.
---

# Shoptet API

Code lives in `packages/clients/shoptet/src/`:

- `client.ts`: `ShoptetClient` (auth, retries, envelope parsing, `paginate`)
- `schemas.ts`: zod schemas for the fields we use
- `webhook.ts`: signature verification and the event schema

Official docs: https://api.docs.shoptet.com (OpenAPI) and
https://developers.shoptet.com. Check them before you add a field or an
endpoint; don't write either from memory.

## Facts the client relies on

- **Base URL**: `https://api.myshoptet.com`. Paths start with `/api/`.
- **Auth**: one of two headers:
  - `Shoptet-Private-API-Token` for our own e-shop (Premium private API);
  - `Shoptet-Access-Token` for an OAuth addon installation.
- **Response envelope**: `{ data, errors, metadata }`.
  - On error, `data` is `null` and `errors[]` holds `{ errorCode, message, instance }`.
  - `metadata.requestId` identifies the request for Shoptet support.
- **Pagination**:
  - Request with `page` (starting at 1) and `itemsPerPage`; each endpoint sets its own maximum.
  - The list comes back under its own key, e.g. `data.orders`, next to `data.paginator` (`totalCount`, `page`, `pageCount`, …).
  - Use `client.paginate(path, key, itemSchema)`.
- **Rate limits**:
  - At most 3 concurrent connections per token, 50 per IP.
  - A leaky bucket on top; the `X-RateLimit-Bucket-Filling` header shows how full it is.
  - A full bucket returns `429` with `Retry-After`; the client waits and retries.
  - Never run requests for the same token in parallel beyond 3.
- **Prices and amounts** are decimal strings (`"121.00"`). Keep them strings in
  schemas (`decimal`) and convert only in `@repo/core-sync`.

## Webhooks

- Generate the key once with `POST /api/webhooks/renew-signature-key` and store
  it as `SHOPTET_WEBHOOK_SIGNATURE_KEY`.
- Verify every request with `verifyShoptetWebhook(rawBody, header, key)`:
  - the header is `Shoptet-Webhook-Signature`, HMAC-SHA1 of the **raw** body;
  - in NestJS, enable `rawBody: true` and read `req.rawBody`; re-serialised JSON won't match.
- The body only says what happened (`event`, `eventInstance`, e.g. an order
  code). Answer fast: store the event (idempotent on `eventInstance` + `event`),
  queue a job, return 200. Fetch the full record in the job.

## Adding an endpoint

1. Read the endpoint in the OpenAPI docs and copy a real response into
   `src/__fixtures__/<name>.json`, with personal data replaced.
2. Add a `z.looseObject` schema for only the fields we use.
3. Add a method on `ShoptetClient`. Use `request` for one record and
   `paginate` for lists.
4. Test it in `client.spec.ts` with a mocked `fetch` (see `integration-testing`).
   Don't call the live API in tests.
5. Export it from `src/index.ts`.

## Never

- Log tokens, the signature key or full customer addresses.
- Write to the live e-shop from tests or the factory's checks.
