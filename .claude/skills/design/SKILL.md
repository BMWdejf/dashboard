---
name: design
description: Build or change dashboard UI from the project's Figma design — reading frames and variables through the Figma MCP, mapping Figma tokens to CSS variables in apps/web, reusing @repo/ui components via Code Connect, and checking the result against the design. Use whenever a task references a Figma link, a design, a mockup, or asks for a new screen.
---

# Design: from Figma to `apps/web`

The Figma MCP server and the plugin's skills do the mechanics:

- `figma:figma-design-to-code`: read a frame and turn it into code;
- `figma:figma-code-connect`: map Figma components to code components;
- `figma:figma-use`: required before any `use_figma` call;
- `figma:figma-generate-library`: build a design system in Figma from code.

The Figma MCP needs `create_session` with the file key before any file tool.
This skill holds **this project's** rules.

## The design file

- **File**: no Figma link yet. Exports from the Figma Raw plugin live in
  `design/figma/*.json` (`Sign Up`, `Sign In`, `Recovery`, `Dashboard-1`).
  **Check that folder before building any screen.** The exports stop a few
  levels deep (inputs, button labels and icons are missing), so infer those
  from the palette and say so in the PR. A Figma link gives the full detail
  through the MCP.
- **Built so far**: `/auth/sign-up` and `/auth/sign-in` (`apps/web/app/auth/`)
  from `Sign Up.json` / `Sign In.json`; the dashboard (`/`) from
  `Dashboard-1.json`, `Sidebar Wrapper.json` and `Dashboard v1 body.json`
  (`apps/web/app/dashboard/`: shell, nav search, SVG charts). Those two
  exports carry only texts (`textContent`), not styles: layout follows
  DESIGN.md, numbers come from `examples_data`. The world map of "Users by
  country" is not built (bars only).
- **Source of truth**: the pages `Screens` (finished screens) and
  `Components` (the library). Frames in other pages are drafts. Don't build
  from them unless the task links one explicitly.
- **No design for a screen?** Build it from the existing components and
  tokens following `next-page`, and say in the PR that there was no frame.

## Tokens

Figma variables map 1:1 to CSS custom properties in `apps/web/app/globals.css`:

The palette comes from `design/figma/Colors.json` and `design/figma/DESIGN.md`
(read DESIGN.md first: it names every colour's role, the type scale, spacing
and card specs). The tokens live in `apps/web/app/globals.css`:

- surfaces `--color-bg` #081028 (canvas and dashboard cards),
  `--color-surface-sunken` #0a1330 (sidebar, inputs), `--color-surface` #0b1739,
  `--color-surface-muted` #101935, `--color-border` #343b4f;
- text `--color-text` #fff, `--color-text-secondary` #d9e1fa,
  `--color-text-tertiary` #d1dbf9, `--color-text-muted` #aeb9e1 (labels, card
  titles), `--color-text-subtle` #7e89ac (metadata);
- brand `--color-accent` #cb3cff, `--gradient-primary` (#cb3cff → #7f25fb, all
  primary buttons), `--color-secondary` #6c72ff, `--color-secondary-alt` #8951ff;
- data/states `--color-info` #21c3fc, `--color-blue` #0e43fb,
  `--color-warning` #fdb52a. The palette has no error colour; `--color-danger`
  is ours until the design adds one;
- `--shadow-card`, `--space-grid` (28px), `--radius-*`, `--font-display`
  (Plus Jakarta Sans), `--font-ui` (Inter). The design is dark-only.

In `Colors.json` the primary swatch is labelled `#6C72FF` but filled `#cb3cff`;
DESIGN.md confirms `#cb3cff` is primary and `#6c72ff` secondary.

| Figma collection | CSS | Example |
|---|---|---|
| `color` (light/dark modes) | `--color-*` in `:root` and in `@media (prefers-color-scheme: dark)` | `color/surface` → `--color-surface` |
| `space` | `--space-*` | `space/4` → `--space-4` |
| `radius` | `--radius-*` | |
| `type` | `--font-*`, `--text-*` | Geist Sans / Geist Mono |

- Read variables with the MCP and compare them with `globals.css` before you
  build. A missing or changed token is its own small change, made first.
- Never hard-code a colour, size or font that has a token.
- The current `--background` / `--foreground` stay as aliases until every
  page uses the new tokens.

## Components

- A Figma component with Code Connect maps to a component in `packages/ui`.
  Use it; don't recreate it in the page.
- A Figma component without a code counterpart: build it in `packages/ui`
  (see `next-page`), then add the Code Connect mapping.
- Match variants and props by name (`variant=primary` → `variant="primary"`).

## Building a screen

1. Open the frame from the task with `get_design_context` and `get_screenshot`.
2. List which components and tokens it uses, and what is missing in code.
3. Add missing tokens and components first, then the page (`next-page`).
4. Handle what the frame doesn't show (loading, empty, error, phone width,
   dark mode) with the existing patterns, and note it in the PR.
5. Run the dev server, screenshot the page at desktop and phone width, and
   compare it with the frame. List any deliberate differences in the PR.

## In the factory

When the issue links a Figma frame, the spec copies the link, the builder
follows this skill, and `reviewer-ui` compares the screenshots with the frame.
A difference from the design is a CHANGES finding unless the PR explains it.
