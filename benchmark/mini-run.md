# Mini run: does the per-run usage line work, and what do small tasks cost?

Not the benchmark in README.md: no comparison with plain Sonnet or `opusplan` yet, one machine, one fixture, three tiny tasks. It tests the plumbing (per-run usage, history, forecast) and gives a first rough cost.

Fixture: a Python 3.9 cart project (about 40 lines), run in order without resetting. Acceptance by script, checked after each run.

| Run | Task | Worker tasks (tier) | Escalations | Opus calls | Check | Usage used (5h / week, points) |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | fix a tax rounding bug | 1 (low) | 0 | 0 | pass | 0 / 0 |
| 2 | discount codes in 4 files | 2 (medium, low) | 0 | 0 | pass | 1 / 1 |
| 3 | `--json` flag and docs | 1 (low) | 0 | 0 | pass | 0 / 0 |

Start 16% / 32%, end 17% / 33%: the whole series moved the 5-hour window by 1 point. Each verifier was a fresh agent; every check passed on the first attempt.

What this shows:
- The per-run usage sentence and the history log work end to end; the forecast ("0-1% of the 5-hour window") matched the third run.
- The host reports usage in whole points, so runs under one point read as 0.

What it does not show:
- Whether duo is cheaper than plain Sonnet: not measured.
- Agent overhead is visible, though: each worker used about 76-78k tokens even for a one-file change, and each verifier about 14k.
- Anything about large tasks or the Opus gates (none were used).
