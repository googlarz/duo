#!/usr/bin/env bash
# Fails if a plugin changed since origin/main but its version did not, because
# `claude plugin update` only sees a new version. Run before pushing.
set -u
cd "$(git rev-parse --show-toplevel)" || exit 1
git fetch -q origin main 2>/dev/null
rc=0
for d in plugins/*/; do
  n=$(basename "$d")
  [ -f "$d.claude-plugin/plugin.json" ] || continue
  if ! git diff --quiet origin/main -- "$d" || [ -n "$(git status --porcelain -- "$d")" ]; then
    new=$(sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' "$d.claude-plugin/plugin.json" | head -1)
    old=$(git show "origin/main:${d}.claude-plugin/plugin.json" 2>/dev/null | sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' | head -1)
    mk=$(grep -A4 "\"name\": \"$n\"" .claude-plugin/marketplace.json | sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' | head -1)
    if [ "$new" = "$old" ]; then echo "FAIL $n changed but version still $new"; rc=1; fi
    if [ "$new" != "$mk" ]; then echo "FAIL $n plugin.json=$new marketplace.json=$mk"; rc=1; fi
  fi
done
[ $rc -eq 0 ] && echo "versions ok"
exit $rc
