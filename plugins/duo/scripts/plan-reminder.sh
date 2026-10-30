#!/usr/bin/env bash
# SessionStart hook: tells Claude to announce its plan to the agents panel before it delegates, so the panel can show
# the steps that have not started yet (a verifier or reviewer launched later). Fixed text, no input read. Always exits 0.
cat <<'JSON'
{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"duo agents panel: if the tool mcp__duo-progress__progress is among your tools (load it with ToolSearch if it is deferred) and you are about to delegate to two or more subagents, call it once first with a short `title` naming the user's task, `total`, and every planned step in `tasks` (including a verifier or reviewer you will start later, each with `after` for what it waits for), so the panel shows the whole plan as waiting cards. Pass each task title verbatim as the Agent `description`. Call it with `finished: true` when the job ends."}}
JSON
exit 0
