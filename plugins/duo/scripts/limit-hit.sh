#!/usr/bin/env bash
# StopFailure(rate_limit) hook: records that a usage limit was hit in ~/.claude/savvy-limit-hit.json.
# Never fails: always exits 0.
input=$(cat 2>/dev/null) || input=""
out="${HOME}/.claude/savvy-limit-hit.json"
now=$(date +%s)
{
  if command -v jq >/dev/null 2>&1; then
    json=$(printf '%s' "$input" | jq -c --argjson now "$now" '{at: $now, session_id: (.session_id // "")}' 2>/dev/null) \
      || json=$(printf '{"at":%s,"session_id":""}' "$now")
    [ -n "$json" ] || json=$(printf '{"at":%s,"session_id":""}' "$now")
  elif command -v python3 >/dev/null 2>&1; then
    json=$(printf '%s' "$input" | python3 -c '
import json, sys, time
try:
    d = json.load(sys.stdin)
except Exception:
    d = {}
print(json.dumps({"at": int(time.time()), "session_id": str((d or {}).get("session_id", ""))}, separators=(",", ":")))' 2>/dev/null)
  fi
  if [ -n "$json" ]; then
    mkdir -p "$(dirname "$out")"
    tmp=$(mktemp "${out}.XXXXXX") && printf '%s\n' "$json" >"$tmp" && mv -f "$tmp" "$out" || rm -f "$tmp"
  fi
} >/dev/null 2>&1
exit 0
