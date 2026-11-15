---
name: nest-module
description: Add or change a NestJS module, controller, service or endpoint in apps/api of this repo — file layout, registration, input validation, config, webhooks with raw body, and unit/e2e tests. Use for any backend work in apps/api.
---

# Add a NestJS module to `apps/api`

The API is NestJS 12, compiled by SWC (`nest-cli.json`: `builder: swc`,
`typeCheck: false`). Types are checked separately by `pnpm check-types`, so
run it; the dev build won't catch type errors.

## Layout

One folder per feature, as in `src/links/`:

```
apps/api/src/<feature>/
  <feature>.module.ts
  <feature>.controller.ts      HTTP only: parse input, call the service, return
  <feature>.service.ts         logic; talks to @repo/client-* and @repo/core-*
  <feature>.controller.spec.ts
  <feature>.service.spec.ts
```

- Register the module in `imports` of `src/app.module.ts`.
- Shared request and response types go in `packages/api/src/<feature>/`
  (`dto/` and `entities/`) and are exported from `packages/api/src/entry.ts`.
  The web app imports the same types from `@repo/api`.
- Import order: framework, blank line, `@repo/*`, blank line, local (see
  `links.controller.ts`).

## Input validation

The DTOs in `packages/api` are TypeScript types only, so nothing checks them at
runtime. Every endpoint that takes `@Body()`, `@Query()` or `@Param()` must
validate it.

- Use a zod schema and a pipe. If `apps/api/src/common/zod-validation.pipe.ts`
  doesn't exist yet, create it once (`transform(value) { return schema.parse(value) }`,
  throwing `BadRequestException` with the issues). Adding `zod` to
  `apps/api/package.json` is a dependency change, so the approver will escalate it.
- Parse ids with `ParseIntPipe`, or with a zod schema, never with `+id` as in
  the template's `links.controller.ts`.
- Never put user input into HTML, SQL or shell. When rendering strings, see how
  `escape-html` is used in `links.service.ts`.

## Config and services

- Read env only through `loadEnv(schema)` from `@repo/core-config`, once, in a
  provider (`{ provide: SHOPTET_ENV, useFactory: () => loadEnv(shoptetEnv) }`).
  Never read `process.env.X` in services.
- Construct clients (`ShoptetClient`, `FlexiClient`) in a provider factory, so
  tests can override them with `overrideProvider`.
- Don't run long work in a request. Sync and scraping jobs belong in a queue
  processed by a worker. The worker doesn't exist yet, so ask before building
  one. The endpoint returns `202` with a job id.

## Webhooks (Shoptet)

- Create the app with `NestFactory.create(AppModule, { rawBody: true })` in
  `src/main.ts`. Changing `main.ts` is escalated, so say why in the PR.
- In the handler, read `req.rawBody` (`@Req() req: RawBodyRequest<Request>`)
  and check it with `verifyShoptetWebhook` from `@repo/client-shoptet`.
  Return `401` on a bad signature, before parsing anything.
- Store the event idempotently, queue the work and return `200` quickly.

## Errors

Throw Nest HTTP exceptions (`NotFoundException`, `BadRequestException`) from
services that the controller calls. Map `ShoptetApiError` and `FlexiApiError`
to `502 Bad Gateway`, with a message safe to show. Never pass tokens, URLs with
credentials or raw upstream bodies to the client.

## Tests

- **Unit** (`src/**/*.spec.ts`, run by `pnpm --filter api test` and by
  `checks.sh`): use `Test.createTestingModule`, and replace clients with
  `overrideProvider(...).useValue({ getOrder: jest.fn() })`. No network.
- **E2E** (`test/*.e2e-spec.ts`, `pnpm --filter api test:e2e`, not in
  `checks.sh`): supertest against `app.getHttpServer()`. Use it for routing,
  validation (`400`) and webhook signature (`401`/`200`) cases.
- Import `describe/it/expect/jest` from `@jest/globals`, as the existing specs do.

## Running

`pnpm --filter api dev` builds and watches on port 3000, which is hard-coded in
`src/main.ts`. The web app expects the API there.
