# Limit marker and wake-up (read from SKILL.md section 5)

`~/.claude/duo-limit-hit.json` (`{"at": epoch s, "session_id"}`) is a hint, written when a turn dies from a rate limit.

- Baseline: before the first dispatch, and again whenever the user resumes after a stop, read `at` from the file if it exists (otherwise 0).
- Check the file between dispatches. The marker counts only if its `at` is greater than the baseline, and is ignored when `five_hour.resets_at` from the usage reading you used is already in the past; with no reading, it counts.
- If it counts, stop dispatching and report: accepted tasks, finished-but-unreviewed tasks, pending tasks, so the user can resume. A worker or turn that died this way is interrupted, not a failed attempt.
- Offer, in one line, to resume by itself at the reset time (`resets_at`). If a scheduling tool is among your tools (`CronCreate` or `ScheduleWakeup`, possibly deferred), schedule one wake-up at that time with a prompt that tells you to continue from the report. Do it only after the user says yes, and say that the session must stay open for it to fire.
- If your own turn died, the user simply says continue and the flow resumes from the report.
- Switching model does not help for session or weekly limits (shared across models); only for a model-specific Opus or Sonnet limit message.
