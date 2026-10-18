#!/usr/bin/env bash
# Before merging the starter (docs/staying-current.md, step 1): lists every
# incoming starter migration that redefines a function, re-issues a column
# grant, or re-adds a named constraint that one of YOUR migrations also
# defines. Git merges those without a conflict, and the starter's version
# replaces yours when the migration runs. It compares names, not bodies (a
# `grant execute on function` of yours counts too), so read each hit: one
# that changes what you changed is a follow-up migration to write, your
# lines reapplied on the starter's new body (Migrations, "Objects you both
# changed").
#
#   bun run sync:check                 # HEAD against upstream/main
#   bash scripts/upstream-redefines.sh <ours> <upstream>
set -euo pipefail
ours=${1:-HEAD}
up=${2:-upstream/main}

# Added on each side since the two last met.
yours=$(git diff --name-only --diff-filter=A "$up...$ours" -- supabase/migrations)
incoming=$(git diff --name-only --diff-filter=A "$ours...$up" -- supabase/migrations)

# A migration's SQL on one line: a statement may span lines (a column grant
# often does), and every pattern below then matches it whole.
flat() { git show "$1" | tr -s '[:space:]' ' '; }

found=0
for file in $incoming; do
  names=$(flat "$up:$file" \
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
      # Read whole, then match: `grep -q` in a pipe can exit before the
      # reader is done and, under pipefail, turn a match into a miss.
      text=$(flat "$ours:$mine")
      if grep -E "$pattern" <<< "$text" > /dev/null; then hits="$hits $mine"; fi
    done
    if [ -n "$hits" ]; then
      echo "$file redefines $name; yours:$hits"
      found=1
    fi
  done <<< "$names"
done

if [ "$found" = 0 ]; then echo "No incoming migration redefines anything yours defines."; fi
