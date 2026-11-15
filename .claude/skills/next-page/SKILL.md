---
name: next-page
description: Add or change a page, layout or component in apps/web (Next.js App Router) of this repo — data fetching from the NestJS API, loading/empty/error states, styling with CSS Modules and the theme tokens, shared components from @repo/ui. Use for any frontend work in apps/web or packages/ui.
---

# Add a page to `apps/web`

Next.js 16 App Router with React 19, run with `next dev --port 3001`. Pages live in
`apps/web/app/<route>/page.tsx`.

## Data

- Pages are **server components** by default. Fetch from the API on the
  server, as `getLinks()` does in `app/page.tsx`:
  - `fetch(url, { cache: 'no-store' })` for dashboard data, which must be fresh;
  - type the result with the shared types from `@repo/api`.
- The API base URL is hard-coded as `http://localhost:3000` today. When a
  second page needs the API, move it to one helper, `apps/web/lib/api.ts`,
  reading `API_URL` with that default. A new env variable is escalated by the
  approver, so say so in the PR.
- The API may be down or slow. Every page that fetches handles it: catch the
  error, log it on the server, and render an error state. Don't throw to the
  user.
- Add `'use client'` only to the component that needs state, effects or event
  handlers, and keep it small. `packages/ui/src/button.tsx` is an example.
- Never call Shoptet, Flexi or scraped sites from the web app. It talks only
  to our API.

## States

Each data view has three states:

- **Loading**: `loading.tsx` next to the page, or `<Suspense>`.
- **Empty**: say what is missing and what to do. Today's example is
  "No links available. Make sure the NestJS API is running on port 3000."
- **Error**: a short message, plus `error.tsx` for unexpected failures.

## Styling

- **CSS Modules**: `<page>.module.css` next to the page, imported as `styles`.
  No inline `style={{}}`; the inline grey in `page.tsx` is template leftover, so
  don't copy it.
- **Tokens**: `app/globals.css` defines `--background` and `--foreground`, with
  dark-mode values under `@media (prefers-color-scheme: dark)`. Page-level greys
  and hover colours are defined per module, as `.page` does in `page.module.css`.
  Use variables, not hard-coded colours, and define the dark value too.
- **Fonts**: `--font-geist-sans` and `--font-geist-mono`, set in `app/layout.tsx`.
- **Images**: theme-specific images use the `imgLight`/`imgDark` classes
  (see `ThemeImage` in `page.tsx`).
- Check phone width and both colour schemes.

## Shared components (`packages/ui`)

- One component per file in `packages/ui/src/`, imported as
  `@repo/ui/<file>` (the package exports `./*` → `./src/*.tsx`, with no build step).
- Move a component there when a second page needs it, not before.
- Components take `className` and don't hard-code colours.
- `card.tsx` and `button.tsx` are template examples. Fix or replace them, don't
  build on their `utm_*` links and `alert()`.

## Accessibility

Use real `<button>` and `<a>` elements, label every form field, give images
`alt` (or `aria-hidden` if decorative), and add
`rel="noopener noreferrer"` on `target="_blank"` links.

## Checks

`pnpm --filter web lint` (`--max-warnings 0`), `pnpm --filter web check-types`
and `pnpm --filter web build`. The web app has no unit tests yet. Test logic
by moving it into a function in `@repo/core-*` and testing it there.
