---
name: setup
description: One-time setup for duo's usage-limit guard. Wires a small helper into your status line (keeping your own) after you say yes. Invoke with /duo:setup.
disable-model-invocation: true
---

# Duo setup

Turn on duo's usage guard. It needs a small helper on the status line, because that is the only place a Pro/Max plan reports its usage. Make no change to `~/.claude/settings.json` before the user says yes. Keep every message plain: no paths, no JSON, no diff unless the user asks for the details.

1. Find the helper: `usage-cache.sh` under `${CLAUDE_PLUGIN_ROOT}/scripts/`; if missing, the newest `~/.claude/plugins/cache/duo/*/scripts/usage-cache.sh`.
2. Read `~/.claude/settings.json` (it may not exist) and note the current `statusLine`. If it already starts with `~/.claude/duo-usage-cache.sh`, say the guard is already on and stop.
3. Ask once, in one or two plain sentences: "Turn on the usage guard? duo will then slow down at 80% of your limit and stop starting new work at 95%. Your current status line keeps working." If they ask for details, show the exact change. On anything other than a clear yes, stop and change nothing.
4. On yes: copy the helper to `~/.claude/duo-usage-cache.sh` (`chmod +x`), save a backup `~/.claude/settings.json.bak-duo`, then change only `statusLine`: with none, `{"type": "command", "command": "~/.claude/duo-usage-cache.sh"}`; with an existing command, put the helper in front of it so it keeps working. Keep every other key. If the file is not valid JSON, stop and report instead of rewriting it.
5. Verify with `echo '{}' | ~/.claude/duo-usage-cache.sh; echo rc=$?` (expect `rc=0`).
6. Tell the user in two lines: the guard is on and takes effect after the next status-line refresh; duo keeps the helper up to date itself, so setup is a one-time step.
