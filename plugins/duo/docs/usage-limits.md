# Usage-limit awareness (Pro/Max)

duo can check how much of your subscription window is used before spawning expensive workers, and notice when a limit was hit.

## Files (contract)

- `~/.claude/duo-usage.json`: `{"updated_at": <epoch s>, "five_hour": {"used_percentage": n, "resets_at": <epoch s>}, "seven_day": {...}}`. A window is omitted if absent.
- `~/.claude/duo-limit-hit.json`: `{"at": <epoch s>, "session_id": "..."}`. A hint, written by the `StopFailure` hook when a turn dies from a rate limit.

## Wire up the statusline helper

Easiest: run `/duo:setup` (it asks before it changes anything). The manual steps below do the same.

The plugin directory may change when the plugin updates (unverified), so first copy the script to a stable path (`cp <plugin dir>/scripts/usage-cache.sh ~/.claude/duo-usage-cache.sh`; refresh this copy after every plugin update), then in `~/.claude/settings.json`:

```json
{ "statusLine": { "type": "command", "command": "~/.claude/duo-usage-cache.sh" } }
```

To keep your own statusline, chain it; the helper forwards the original JSON to it:

```json
{ "statusLine": { "type": "command", "command": "~/.claude/duo-usage-cache.sh ~/.claude/my-statusline.sh" } }
```

Without a chained command it prints e.g. `5h 42% · 7d 18%`. Needs `jq` or `python3`. The script always exits 0.

The StopFailure hook (`hooks/hooks.json`, matcher `rate_limit`) is loaded automatically with the plugin and runs `scripts/limit-hit.sh`.

## How the skill uses them

- It reads `duo-usage.json` before choosing tiers and again before each dispatch, to decide whether to downshift or pause. Files with `updated_at` older than 15 minutes are stale and ignored.
- The orchestrator reads the marker's `at` as a baseline before the first dispatch (0 if there is no marker) and again when the user resumes after a stop. The limit marker counts only if its `at` is greater than that baseline, and is ignored when `five_hour.resets_at` from the usage file is already in the past.
- The marker is a hint written when a turn dies from a rate limit. If the orchestrator's own turn died, the user simply says continue and the flow resumes from the report.
- At >= 80% (the cap) workers are capped at medium and escalation also stops at medium (it reports instead); at >= 95% no new tasks start.

## Confirmed vs unconfirmed

- Confirmed in docs (code.claude.com/docs/en/statusline): statusline stdin has `rate_limits.five_hour` / `seven_day` with `used_percentage` and `resets_at`.
- Confirmed in docs (hooks): `StopFailure` exists; matcher matches the `error` field (`rate_limit` among others); payload has common fields (incl. `session_id`) plus `error`, optional `error_details`, optional `last_assistant_message`; output and exit code are ignored. Plugin `hooks/hooks.json` uses a top-level `hooks` wrapper.
- Not verified: behavior in a live session (real statusline run, real rate-limit event).

## Caveats

- Only Pro/Max subscribers get `rate_limits`, and only after the first API response; either window may be missing (the file is then not written or the window omitted).
- The cache updates only when the statusline refreshes; it can lag, and can go stale (>15 min) during long subagent waits, in which case the skill ignores it.
- Replace `<plugin dir>` with the installed plugin path.
