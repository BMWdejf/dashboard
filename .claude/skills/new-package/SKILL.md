---
name: new-package
description: Create a new workspace package in this Turborepo — an external-service client in packages/clients/<service> or domain logic in packages/core/<name> — with the repo's naming, scripts, tsconfig, eslint and jest setup. Use whenever a task needs a new package or library.
---

# Create a workspace package

## Where and how to name it

| Kind | Folder | Name |
|---|---|---|
| Client for an external service | `packages/clients/<service>` | `@repo/client-<service>` |
| Domain logic shared by apps | `packages/core/<name>` | `@repo/core-<name>` |
| React components | add to `packages/ui` | — |

`pnpm-workspace.yaml` already includes `packages/clients/*` and
`packages/core/*`. A new top-level group needs a new glob there, which the
approver escalates.

Ask first whether it should be a package at all. Code used by one app stays in
that app; extract it when a second consumer appears.

## Steps

1. **Copy a sibling.** Use `packages/clients/flexi` for a client and
   `packages/core/sync` for core logic. Take `package.json`, `tsconfig.json`,
   `tsconfig.build.json`, `eslint.config.mjs` and `jest.config.js`, then change
   `name` and `description`.
2. **Keep the scripts as they are**, because turbo and `factory/checks.sh` rely
   on them:
   ```json
   "build": "tsc -p tsconfig.build.json",
   "check-types": "tsc --noEmit -p tsconfig.json",
   "lint": "eslint \"src/**/*.ts\" --max-warnings 0",
   "test": "jest"
   ```
3. **Entry point**: `src/index.ts` re-exports the public API. `exports`,
   `main` and `types` point at `dist/index.*`, so consumers need a build first.
   `turbo.json` makes `build`, `test` and `check-types` depend on `^build`.
4. **Dependencies**: add with the matching pnpm (10.x):
   `pnpm add <dep> --filter @repo/<name>`. Pin exact versions (remove the
   `^`), as the rest of the repo does. For workspace deps, quote the spec:
   `pnpm add '@repo/client-shoptet@workspace:*' --filter @repo/<name>`.
   A new external dependency is escalated by the approver; say why it's needed.
5. **Rules for the code**:
   - Clients take `fetch` (and any other I/O) as constructor options and never
     read `process.env`. Apps pass config from `@repo/core-config`.
   - Core packages are pure where possible: no network, no clock, no env.
   - Validate external data with zod at the boundary.
6. **Tests**: `src/*.spec.ts`, using `@jest/globals` imports, offline (see
   `integration-testing`). Fixtures go in `src/__fixtures__/`; the build
   excludes them and the specs.
7. **Document it**: add a line under the package list in `AGENTS.md`.
8. **Verify** from the repo root:
   `pnpm install && pnpm turbo run build test lint check-types --filter=@repo/<name>`,
   then `bash factory/checks.sh`.
