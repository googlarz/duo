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
mkdir -p "$H/my scripts"; printf '#!/bin/sh\ncat\n' >"$H/my scripts/sl.sh"; chmod +x "$H/my scripts/sl.sh"
chain=$(printf '%s' "$in" | HOME=$H "$here/usage-cache.sh" "$H/my scripts/sl.sh")
chk "chain: executable path with space" '[ "$chain" = "$in" ]'
chain=$(printf '%s' '{"model":{"display_name":"Opus"}}' | HOME=$H "$here/usage-cache.sh" 'FOO=1 jq -r ".model.display_name" | head -c 40')
chk "chain: quoted env+pipe form"    '[ "$chain" = "Opus" ]'
err=$(printf '%s' "$in" | HOME=$H "$here/usage-cache.sh" no-such-cmd-xyz 2>&1 >/dev/null); rc=$?
chk "chain: missing command is 127"  '[ $rc -eq 127 ]'
chk "chain: missing command error shown" '[ -n "$err" ]'

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

# --- chained command: one argument runs through bash -c
chain=$(printf '%s' "$in" | HOME=$H "$here/usage-cache.sh" 'cat | head -c 5')
chk "chain with a pipe"              '[ "$chain" = "${in:0:5}" ]'
chain=$(printf '%s' "$in" | HOME=$H "$here/usage-cache.sh" 'V=hello; X=1 sh -c "printf %s \$X-$V"')
chk "chain with VAR=1 prefix"        '[ "$chain" = "1-hello" ]'
printf '%s' "$in" | HOME=$H "$here/usage-cache.sh" 'cat >/dev/null; exit 7' >/dev/null; rc=$?
chk "chain forwards exit status"     '[ $rc -eq 7 ]'
err=$(printf '%s' "$in" | HOME=$H "$here/usage-cache.sh" 'cat >/dev/null; echo oops >&2' 2>&1 >/dev/null)
chk "chain keeps stderr"             '[ "$err" = "oops" ]'

# --- missing five_hour window
rm -f "$H/.claude/duo-usage.json"
out=$(printf '%s' '{"rate_limits":{"seven_day":{"used_percentage":18}}}' | HOME=$H "$here/usage-cache.sh")
chk "no five_hour: prints 7d only"   '[ "$out" = "7d 18%" ]'
chk "no five_hour: file lacks it"    '! grep -q five_hour "$H/.claude/duo-usage.json"'

# --- limit marker "at" is numeric
printf '%s' '{"session_id":"abc"}' | HOME=$H "$here/limit-hit.sh"
chk "limit marker at is numeric"     'grep -Eq "\"at\": *[0-9]+" "$H/.claude/duo-limit-hit.json"'

# --- PATH without jq: python3 fallback; without both: printf fallback
B=$(mktemp -d); trap 'rm -rf "$H" "$B"' EXIT
mkdir "$B/nojq" "$B/none"
for t in cat date mkdir mktemp mv rm dirname cmp cp chmod head; do
  p=$(command -v "$t") && ln -s "$p" "$B/nojq/$t" && ln -s "$p" "$B/none/$t"
done
if p=$(command -v python3); then ln -s "$p" "$B/nojq/python3"; fi
bashbin=$(command -v bash)
rm -f "$H/.claude/duo-usage.json"
out=$(printf '%s' "$in" | HOME=$H PATH="$B/nojq" "$bashbin" "$here/usage-cache.sh")
chk "python3 fallback prints 5h/7d"  '[ "$out" = "5h 42% · 7d 18%" ]'
chk "python3 fallback writes file"   'grep -q "\"five_hour\"" "$H/.claude/duo-usage.json"'
rm -f "$H/.claude/duo-limit-hit.json"
printf '%s' '{"session_id":"xyz"}' | HOME=$H PATH="$B/nojq" "$bashbin" "$here/limit-hit.sh"
chk "python3 limit-hit has session"  'grep -q xyz "$H/.claude/duo-limit-hit.json"'
rm -f "$H/.claude/duo-limit-hit.json"
printf '%s' '{"session_id":"xyz"}' | HOME=$H PATH="$B/none" "$bashbin" "$here/limit-hit.sh"; rc=$?
chk "no jq/python3: exits 0"         '[ $rc -eq 0 ]'
chk "no jq/python3: marker has at"   'grep -Eq "\"at\": *[0-9]+" "$H/.claude/duo-limit-hit.json"'

# --- hooks.json: valid, scripts exist and are executable
hooks="$here/../hooks/hooks.json"
chk "hooks.json is valid json"       'python3 -c "import json,sys; json.load(open(sys.argv[1]))" "$hooks"'
missing=$(python3 - "$hooks" "$here/.." <<'PY'
import json, re, sys, os
d = json.load(open(sys.argv[1])); root = sys.argv[2]
for evs in d["hooks"].values():
    for g in evs:
        for h in g["hooks"]:
            for m in re.findall(r'\$\{CLAUDE_PLUGIN_ROOT\}"?/(\S+)', h["command"]):
                f = os.path.join(root, m.strip('"'))
                if not (os.path.isfile(f) and os.access(f, os.X_OK)):
                    print(m)
PY
)
chk "hooks.json scripts executable"  '[ -z "$missing" ]'

# --- the eight worker agents match the body in gen-agents.sh (generated into a temp dir, never into agents/)
G=$(mktemp -d)
mkdir "$G/scripts" "$G/agents"
cp "$here/gen-agents.sh" "$G/scripts/gen-agents.sh"
bash "$G/scripts/gen-agents.sh" >/dev/null 2>&1
drift=""
[ "$(ls "$G"/agents | wc -l)" -eq 8 ] || drift=" (generated count != 8)"
for f in "$G"/agents/duo-*.md; do
  cmp -s "$f" "$here/../agents/$(basename "$f")" || drift="$drift $(basename "$f")"
done
rm -rf "$G"
chk "eight worker agents match gen-agents.sh${drift:+ (drift:$drift)}" '[ -z "$drift" ]'
exit $fail
