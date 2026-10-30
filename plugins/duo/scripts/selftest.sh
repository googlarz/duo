#!/usr/bin/env bash
# Offline selftest for the usage helpers. Uses a throwaway HOME; touches nothing real.
set -u
here=$(cd "$(dirname "$0")" && pwd)
H=$(mktemp -d); trap 'rm -rf "$H"' EXIT
mkdir -p "$H/.claude"
fail=0
ok()  { printf 'ok   %s\n' "$1"; }
bad() { printf 'FAIL %s\n' "$1"; fail=1; }
chk() { if eval "$2"; then ok "$1"; else bad "$1"; fi; }

in='{"rate_limits":{"five_hour":{"used_percentage":42.7,"resets_at":2000000000},"seven_day":{"used_percentage":18}}}'
out=$(printf '%s' "$in" | HOME=$H "$here/usage-cache.sh"); rc=$?
chk "usage-cache exits 0"            '[ $rc -eq 0 ]'
chk "usage-cache prints 5h/7d"       '[ "$out" = "5h 42% · 7d 18%" ]'
chk "usage file written"             '[ -s "$H/.claude/duo-usage.json" ]'
chk "usage file has five_hour"       'grep -q "\"five_hour\"" "$H/.claude/duo-usage.json"'
chk "usage file has updated_at"      'grep -q "updated_at" "$H/.claude/duo-usage.json"'

rm -f "$H/.claude/duo-usage.json"
printf '%s' '{}' | HOME=$H "$here/usage-cache.sh" >/dev/null; rc=$?
chk "no rate_limits: exits 0"        '[ $rc -eq 0 ]'
chk "no rate_limits: no file"        '[ ! -e "$H/.claude/duo-usage.json" ]'

printf '%s' 'not json' | HOME=$H "$here/usage-cache.sh" >/dev/null; rc=$?
chk "garbage input: exits 0"         '[ $rc -eq 0 ]'

chain=$(printf '%s' "$in" | HOME=$H "$here/usage-cache.sh" cat)
chk "chaining forwards stdin"        '[ "$chain" = "$in" ]'

printf '%s' '{"session_id":"abc"}' | HOME=$H "$here/limit-hit.sh"; rc=$?
chk "limit-hit exits 0"              '[ $rc -eq 0 ]'
chk "limit marker has session_id"    'grep -q "abc" "$H/.claude/duo-limit-hit.json"'
chk "limit marker has at"            'grep -q "\"at\"" "$H/.claude/duo-limit-hit.json"'

printf '%s' 'garbage' | HOME=$H "$here/limit-hit.sh"; rc=$?
chk "limit-hit garbage: exits 0"     '[ $rc -eq 0 ]'
printf 'old' >"$H/.claude/duo-usage-cache.sh"
CLAUDE_PLUGIN_ROOT="$here/.." HOME=$H "$here/refresh-helper.sh"; rc=$?
chk "refresh-helper exits 0"         '[ $rc -eq 0 ]'
chk "refresh-helper updates copy"    'cmp -s "$here/usage-cache.sh" "$H/.claude/duo-usage-cache.sh"'
rm -f "$H/.claude/duo-usage-cache.sh"
CLAUDE_PLUGIN_ROOT="$here/.." HOME=$H "$here/refresh-helper.sh"
chk "refresh-helper skips without setup" '[ ! -e "$H/.claude/duo-usage-cache.sh" ]'
out=$("$here/plan-reminder.sh"); rc=$?
chk "plan-reminder exits 0"          '[ $rc -eq 0 ]'
chk "plan-reminder is valid json"    'printf "%s" "$out" | python3 -c "import json,sys; d=json.load(sys.stdin); assert d[\"hookSpecificOutput\"][\"hookEventName\"]==\"SessionStart\""'
chk "plan-reminder names the tool"   'printf "%s" "$out" | grep -q "mcp__duo-progress__progress"'
exit $fail
