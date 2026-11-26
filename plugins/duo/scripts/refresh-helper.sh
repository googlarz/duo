#!/usr/bin/env bash
# SessionStart hook: if the user ran /duo:setup, keep their copy of the statusline helper
# in step with the installed plugin. Does nothing when setup was never run. Always exits 0.
src="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}/scripts/usage-cache.sh"
dst="${HOME}/.claude/duo-usage-cache.sh"
if [ -f "$dst" ] && [ -f "$src" ] && ! cmp -s "$src" "$dst"; then
  # copy to a temp name, then rename, so a status-line run never sees a half-written helper
  tmp="${dst}.tmp.$$"
  cp -f "$src" "$tmp" 2>/dev/null && chmod +x "$tmp" 2>/dev/null && mv -f "$tmp" "$dst" 2>/dev/null || rm -f "$tmp" 2>/dev/null
fi
exit 0
