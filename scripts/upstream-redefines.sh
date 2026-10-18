#!/usr/bin/env bash
# Before merging the starter (docs/staying-current.md, step 1): lists every
# incoming starter migration that redefines a function, re-issues a column
# grant, or re-adds a named constraint that one of YOUR migrations also
# defines (a hit on `grant execute on function` is listed too: read it). Git merges those
# without a conflict, and the starter's body replaces yours when the
# migration runs. Each line printed is a follow-up migration to write:
# your lines, reapplied on the starter's new body (Migrations, "Objects you
# both changed").
#
#   bun run sync:check                 # HEAD against upstream/main
#   bash scripts/upstream-redefines.sh <ours> <upstream>
set -euo pipefail
ours=${1:-HEAD}
up=${2:-upstream/main}

# Added on each side since the two last met.
yours=$(git diff --name-only --diff-filter=A "$up...$ours" -- supabase/migrations)
incoming=$(git diff --name-only --diff-filter=A "$ours...$up" -- supabase/migrations)

found=0
for file in $incoming; do
  names=$(git show "$up:$file" \
    | grep -oE 'function public\.[a-z_]+|grant update \([^)]*\) on public\.[a-z_]+|add constraint [a-z_]+' \
    | sed -E 's/^function //; s/^grant update \([^)]*\) on /column grant on /; s/^add constraint /constraint /' \
    | sort -u || true)
  while IFS= read -r name; do
    [ -n "$name" ] || continue
    case "$name" in
      "column grant on "*) pattern="grant update \\([^)]*\\) on ${name#column grant on }([^a-z_]|\$)" ;;
      "constraint "*) pattern="add constraint ${name#constraint }([^a-z_]|\$)" ;;
      *) pattern="function ${name//./\\.}([^a-z_]|\$)" ;;
    esac
    hits=""
    for mine in $yours; do
      if git show "$ours:$mine" | grep -qE "$pattern"; then hits="$hits $mine"; fi
    done
    if [ -n "$hits" ]; then
      echo "$file redefines $name; yours:$hits"
      found=1
    fi
  done <<< "$names"
done

if [ "$found" = 0 ]; then echo "No incoming migration redefines anything yours defines."; fi
