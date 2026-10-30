#!/usr/bin/env bash
# SessionStart hook: if the user ran /duo:setup, keep their copy of the statusline helper
# in step with the installed plugin. Does nothing when setup was never run. Always exits 0.
src="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}/scripts/usage-cache.sh"
dst="${HOME}/.claude/duo-usage-cache.sh"
if [ -f "$dst" ] && [ -f "$src" ] && ! cmp -s "$src" "$dst"; then
  cp -f "$src" "$dst" 2>/dev/null && chmod +x "$dst" 2>/dev/null
fi
exit 0
