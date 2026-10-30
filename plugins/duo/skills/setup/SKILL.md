---
name: setup
description: One-time setup for duo's usage-limit guard. Copies the statusline helper to a stable path and, after you confirm, wires it into ~/.claude/settings.json (chaining your existing statusline). Invoke with /duo:setup.
disable-model-invocation: true
---

# Duo setup

Turn on duo's usage guard. It needs the statusline helper, because that is the only place a Pro/Max plan reports its usage. Make no change to `~/.claude/settings.json` before the user says yes.

1. Find the helper: `usage-cache.sh` under `${CLAUDE_PLUGIN_ROOT}/scripts/`. If you cannot find it, search `~/.claude/plugins/cache/` for `duo/*/scripts/usage-cache.sh` and use the newest.
2. Read `~/.claude/settings.json` (it may not exist). Note the current `statusLine`, if any.
3. Show the user exactly what will change, as a short diff:
   - copy the helper to `~/.claude/duo-usage-cache.sh` (executable);
   - set `statusLine` to `{"type": "command", "command": "~/.claude/duo-usage-cache.sh"}`; if the user already has a statusline command, chain it: `"~/.claude/duo-usage-cache.sh <their command>"` so their statusline keeps working.
4. Ask once: apply this? On anything other than a clear yes, stop and change nothing.
5. On yes: copy the helper, `chmod +x` it, edit `settings.json` with a minimal edit that touches only `statusLine` (keep every other key; if the file is not valid JSON, stop and report instead of rewriting it).
6. Verify: run `echo '{}' | ~/.claude/duo-usage-cache.sh; echo rc=$?` and expect `rc=0`. Tell the user the usage file `~/.claude/duo-usage.json` appears after the next statusline refresh in a Pro/Max session, and that the helper copy must be refreshed after a plugin update by running `/duo:setup` again.
7. Say in two lines what is now on: at 80% duo downshifts, at 95% it stops starting work.
