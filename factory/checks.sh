#!/usr/bin/env bash
# The repo's checks. Exit 0 only when the branch is fit to review.
#
# The gate runs this script from the main checkout with the job's worktree as
# the working directory. Keep it fast, deterministic and non-interactive: no
# watch modes, no prompts, nothing that rewrites files.
#
# Runs every workspace package (apps/*, packages/*, packages/clients/*,
# packages/core/*) through turbo.
set -euo pipefail

export CI=1
export TURBO_TELEMETRY_DISABLED=1

# Use the pnpm that matches package.json's "packageManager" (an older pnpm
# earlier on PATH can't read the v9 lockfile and would try to recreate it).
want="$(sed -n 's/.*"packageManager": *"pnpm@\([^"]*\)".*/\1/p' package.json)"
PNPM=""
while IFS= read -r p; do
  if [ "$("$p" --version 2>/dev/null)" = "$want" ]; then PNPM="$p"; break; fi
done < <(which -a pnpm 2>/dev/null | awk '!seen[$0]++')
if [ -z "$PNPM" ]; then
  echo "checks.sh: pnpm $want not found on PATH" >&2
  exit 1
fi

echo "==> install"
"$PNPM" install --frozen-lockfile --prefer-offline
echo "==> lint"
"$PNPM" lint
echo "==> check-types"
"$PNPM" check-types
echo "==> test"
"$PNPM" test
echo "==> build"
"$PNPM" build
echo "==> all checks passed"
