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

- **File**: _not set yet_. Once the design exists, put its URL here and in
  `AGENTS.md`.
- **Source of truth**: the pages `Screens` (finished screens) and
  `Components` (the library). Frames in other pages are drafts. Don't build
  from them unless the task links one explicitly.
- **No design for a screen?** Build it from the existing components and
  tokens following `next-page`, and say in the PR that there was no frame.

## Tokens

Figma variables map 1:1 to CSS custom properties in `apps/web/app/globals.css`:

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
