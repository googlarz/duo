#!/usr/bin/env bash
# Fails if a plugin changed since its base but its version did not, because
# `claude plugin update` only sees a new version. Run before pushing.
# Base is origin/main; on a CI push it is $BASE_SHA (the push's before-SHA), else HEAD~1.
set -u
cd "$(git rev-parse --show-toplevel)" || exit 1
git fetch -q origin main 2>/dev/null
base=origin/main
if [ "${GITHUB_EVENT_NAME:-}" = "push" ]; then
  if [ -n "${BASE_SHA:-}" ] && git cat-file -e "${BASE_SHA}^{commit}" 2>/dev/null; then base=$BASE_SHA
  else base=HEAD~1; fi
fi
ver() { # ver <json file or stdin>
  if command -v jq >/dev/null 2>&1; then jq -r '.version // empty' 2>/dev/null
  else sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' | head -1; fi
}
mkver() { # mkver <plugin name>
  if command -v jq >/dev/null 2>&1; then jq -r --arg n "$1" '.plugins[] | select(.name == $n) | .version // empty' .claude-plugin/marketplace.json 2>/dev/null | head -1
  else grep -A4 "\"name\": \"$1\"" .claude-plugin/marketplace.json | sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' | head -1; fi
}
rc=0
for d in plugins/*/; do
  n=$(basename "$d")
  [ -f "$d.claude-plugin/plugin.json" ] || continue
  if ! git diff --quiet "$base" -- "$d" || [ -n "$(git status --porcelain -- "$d")" ]; then
    new=$(ver <"$d.claude-plugin/plugin.json")
    old=$(git show "$base:${d}.claude-plugin/plugin.json" 2>/dev/null | ver)
    mk=$(mkver "$n")
    if [ "$new" = "$old" ]; then echo "FAIL $n changed but version still $new"; rc=1; fi
    if [ "$new" != "$mk" ]; then echo "FAIL $n plugin.json=$new marketplace.json=$mk"; rc=1; fi
  fi
done
[ $rc -eq 0 ] && echo "versions ok"
exit $rc
