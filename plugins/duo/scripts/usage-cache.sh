#!/usr/bin/env bash
# Statusline helper: caches subscription rate-limit usage to ~/.claude/duo-usage.json.
# Usage: usage-cache.sh [next-statusline-command ...]   (reads Claude Code statusline JSON on stdin)
# Never fails the statusline: always exits 0, errors silent.
input=$(cat 2>/dev/null) || input=""
out="${HOME}/.claude/duo-usage.json"
now=$(date +%s)
text=""

extract() {
  if command -v jq >/dev/null 2>&1; then
    printf '%s' "$input" | jq -c --argjson now "$now" '
      (.rate_limits // {}) as $r
      | [ "five_hour", "seven_day" ] as $k
      | reduce $k[] as $w ({};
          if ($r[$w] | type) == "object" and ($r[$w].used_percentage != null)
          then .[$w] = ({used_percentage: $r[$w].used_percentage}
                        + (if $r[$w].resets_at != null then {resets_at: $r[$w].resets_at} else {} end))
          else . end)
      | if length > 0 then {updated_at: $now} + . else empty end' 2>/dev/null
  elif command -v python3 >/dev/null 2>&1; then
    printf '%s' "$input" | python3 -c '
import json, sys, time
try:
    r = (json.load(sys.stdin) or {}).get("rate_limits") or {}
    o = {}
    for w in ("five_hour", "seven_day"):
        v = r.get(w)
        if isinstance(v, dict) and v.get("used_percentage") is not None:
            o[w] = {"used_percentage": v["used_percentage"]}
            if v.get("resets_at") is not None:
                o[w]["resets_at"] = v["resets_at"]
    if o:
        o = dict(updated_at=int(time.time()), **o)
        print(json.dumps(o, separators=(",", ":")))
except Exception:
    pass' 2>/dev/null
  fi
}

{
  json=$(extract)
  if [ -n "$json" ]; then
    mkdir -p "$(dirname "$out")" 2>/dev/null
    tmp=$(mktemp "${out}.XXXXXX" 2>/dev/null) &&
      printf '%s\n' "$json" >"$tmp" && mv -f "$tmp" "$out" || rm -f "$tmp" 2>/dev/null
    if command -v jq >/dev/null 2>&1; then
      text=$(printf '%s' "$json" | jq -r '[ (if .five_hour then "5h \(.five_hour.used_percentage | floor)%" else empty end),
        (if .seven_day then "7d \(.seven_day.used_percentage | floor)%" else empty end) ] | join(" · ")' 2>/dev/null)
    else
      text=$(printf '%s' "$json" | python3 -c '
import json, sys
o = json.load(sys.stdin)
print(" · ".join("%s %d%%" % (l, o[k]["used_percentage"]) for k, l in (("five_hour","5h"),("seven_day","7d")) if k in o))' 2>/dev/null)
    fi
  fi
} 2>/dev/null

if [ "$#" -gt 0 ]; then
  printf '%s' "$input" | "$@" 2>/dev/null
else
  [ -n "$text" ] && printf '%s\n' "$text"
fi
exit 0
