# History, learning and context hygiene (read from SKILL.md section 14)

## History file

`~/.claude/duo-history.jsonl` is duo's own log, one JSON line per finished run, written by you at close with Bash (`printf '%s\n' '<json>' >> ~/.claude/duo-history.jsonl`):

`{"at": epoch s, "title", "tasks": {"low": n, "medium": n, ...}, "opus_calls": n, "fable_calls": n, "escalations": n, "used_5h": pct points or null, "used_7d": pct points or null}`

- Create the file if it is missing; if a write fails, skip it silently.
- The file stays on the user's machine; tell them it exists in the final report once.

## Forecast and learning

- Before planning, read at most the last 40 lines.
- Forecast = the range of `used_5h` over past runs of a similar size (task count within one), shown as a range, not a point. With fewer than 3 such runs, say nothing about it.
- Learning: if a tier shows escalations in more than a third of its past runs, start similar tasks one tier higher and say so in one line.

## Context hygiene

Every earlier message is resent on every turn, so a session that carries a finished flow pays for it on each later request. Once the run is reported and the user's next request is unrelated to it:

1. Write anything worth keeping to a file or memory first (decisions, open questions, the history line).
2. Clear the conversation yourself: call `mcp__ccd_session_mgmt__clear_session` with `session_id: "self"` if it is among your tools (load it with ToolSearch; the app asks the user to approve, and the old conversation stays recoverable through "Resume previous session"), otherwise tell the user to run `/clear`.

If the next request continues the same work, use `/compact` instead of clearing.
